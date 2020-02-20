'use strict';

const fs = require('fs');

const Page = require('../page.js');
const redis = require('../redis.js');
const Cache = require('../cache.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

const WIFI_ROOM = 'wifi';
const NOTES_FILE = 'clonernotes.json';

const settings = redis.useDatabase('settings');
const profile = redis.useDatabase('profiles');

const cache = new Cache('wifi');

let leftpad = val => (val < 10 ? `0${val}`: `${val}`);

let notes = {};
try {
	notes = require(`../data/${NOTES_FILE}`);
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND' && e.code !== 'ENOENT') throw e;
}
if (!notes || typeof notes !== 'object') notes = {};

class WifiList {
	constructor(name, file, columnNames, columnKeys, noOnlinePage, noTime) {
		this.name = name;
		this.file = file;
		this.columnNames = columnNames;
		this.columnKeys = columnKeys;
		this.noTime = noTime;
		this.noOnlinePage = noOnlinePage;

		if (!noTime) {
			columnKeys.push('date');
		}

		this.data = this.loadList();

		let changeList = async (edits, room, tokenData) => {
			if (!(this.name in tokenData) || !(tokenData.permission || tokenData.user)) return;

			if (!tokenData.permission && (Object.keys(edits).length && !(tokenData.user in edits))) return;

			for (let i in edits) {
				if (!this.data[i]) return;
				for (let key in edits[i]) {
					if (key === 'score' || key === 'username' || (key === 'date' && !tokenData.permission)) continue;

					let elem = edits[i][key];
					if (key === 'fc') {
						if (!tokenData.permission) continue;
						elem = Utils.toFc(elem);
						if (!elem) continue;
						if (!Utils.validateFc(elem)) continue;
					}
					this.data[i][key] = elem;
				}
				if (!this.data[i].date) this.data[i].date = Date.now();
				ChatHandler.send(WIFI_ROOM, `/modnote ${tokenData.user} updated ${i}'s ${this.name.slice(0, -1)} info.`);
			}

			this.writeList();
		};

		let parseQuery = async (data, room, tokenData) => {
			if (!data.edits) return;

			let edits = {};

			for (let i in data.edits) {
				if (Object.keys(data.edits[i]).some(val => !this.columnKeys.includes(val))) return;
				edits[i] = data.edits[i];
			}

			changeList(edits, room, tokenData);
		};

		let generatePage = async (room, query, tokenData) => {
			let data = {name: this.name, columnNames: this.columnNames, noOnline: this.noOnlinePage};

			data.tokenData = tokenData;

			let whitelist = await settings.hvals(`whitelist:${this.name}`);

			if (whitelist && whitelist.length) {
				data.editors = whitelist.join(', ');
			}

			data.entries = Object.keys(this.data).sort((a, b) => {
				if ('date' in this.data[a] && !parseInt(this.data[a].date)) return -1;
				if ('date' in this.data[b] && !parseInt(this.data[b].date)) return 1;
				if (this.columnKeys.includes('score')) {
					if (parseInt(this.data[a].score) > parseInt(this.data[b].score)) return -1;
					if (parseInt(this.data[a].score) < parseInt(this.data[b].score)) return 1;
				}
				return a.localeCompare(b);
			}).map(val => ({data: this.data[val], online: (!this.noOnlinePage && (ChatHandler.userlists[WIFI_ROOM] && (val in ChatHandler.userlists[WIFI_ROOM] || (this.data[val].alts && this.data[val].alts.split(',').map(val => toId(val)).filter(val => val in ChatHandler.userlists[WIFI_ROOM]).length))))}));

			return data;
		};

		this.page = new Page(this.name, generatePage, 'cloners.html', {token: this.name, optionalToken: true, postHandler: parseQuery, rooms: [WIFI_ROOM]});
	}

	add(user, params, identifier) {
		let key = toId(identifier || params[0]);

		if (params.length !== this.columnKeys.length - (this.noTime ? 0 : 1)) return "Invalid amount of arguments";
		if (key in this.data) return `'${(identifier || params[0])}' is already a ${this.name.slice(0, -1)}.`;

		let data = {};
		if (!this.noTime) {
			params.push(Date.now());
		}
		for (let i = 0; i < this.columnKeys.length; i++) {
			// Validate friend codes
			if (this.columnKeys[i] === 'fc') {
				let split = params[i].split(',').map(param => param.trim());

				for (let [i, fc] of split.entries()) {
					fc = Utils.toFc(fc);
					if (!fc) return "Invalid formatting for Friend Code. format: ``1111-2222-3333``";
					split[i] = fc;
					if (!Utils.validateFc(fc)) return "The Friend code you entered is invalid";
				}

				params[i] = split.join(', ');
			}
			data[this.columnKeys[i]] = params[i];
		}
		this.data[key] = data;
		fs.appendFile(this.file, this.renderEntry(key), () => {});

		ChatHandler.send(WIFI_ROOM, `/modnote ${user} added ${key} to the ${this.name.slice(0, -1)} list.`);
		if (this.name === 'cloners') {
			if (!notes[key]) notes[key] = {};
			notes[key][Date.now()] = ['', "Added to the list."];
			fs.writeFile(`./data/${NOTES_FILE}`, JSON.stringify(notes), () => {});
		}

		return `'${(identifier || params[0])}' was successfully added to the ${this.name.slice(0, -1)} list.`;
	}

	remove(user, target) {
		if (!(target in this.data)) return `${target} is not on the ${this.name.slice(0, -1)} list.`;
		delete this.data[target];
		this.writeList();
		ChatHandler.send(WIFI_ROOM, `/modnote ${user} deleted ${target} from the ${this.name.slice(0, -1)} list.`);
		if (this.name === 'cloners') {
			if (!notes[target]) notes[target] = {};
			notes[target][Date.now()] = ['', `Removed from the list by ${user}.`];
			fs.writeFile(`./data/${NOTES_FILE}`, JSON.stringify(notes), () => {});
		}

		return `${target} successfully removed.`;
	}

	update(user, params, self) {
		if (params.length < 2) return "Invalid number of arguments provided.";

		let identifier = toId(params[0]);
		for (let i = 1; i < params.length; i++) {
			let [key, ...values] = params[i].split(':');
			if (!key || !values.length) return "Syntax error.";

			key = toId(key);
			let value = values.join(':').trim();

			if (key === 'date' || key === 'score' || key === 'totalscore') return "This column can't be changed.";
			if (!this.columnKeys.includes(key)) return `Invalid key: ${key}`;

			if (key === 'fc') {
				if (self) return "Users are not allowed to change their own Friend Code";
				let split = value.split(',').map(param => param.trim());

				for (let [i, fc] of split.entries()) {
					fc = Utils.toFc(fc);
					if (!fc) return "Invalid formatting for Friend Code. format: ``1111-2222-3333``";
					split[i] = fc;
					if (!Utils.validateFc(fc)) return "The Friend code you entered is invalid";
				}

				value = split.join(', ');
			} else if (key === 'username') {
				if (identifier !== toId(this.data[identifier].username)) break;

				if (self) return "You cannot edit your own name on the list.";
				let entry = this.data[identifier];
				delete this.data[identifier];
				identifier = toId(value);
				this.data[identifier] = entry;
			}

			this.data[identifier][key] = value;
		}

		this.writeList();
		ChatHandler.send(WIFI_ROOM, `/modnote ${user} updated ${(toId(user) === identifier ? 'their' : `${identifier}'s`)} ${this.name.slice(0, -1)} info.`);
		return `${identifier} successfully updated.`;
	}

	purgeList() {
		let removed = [];

		let now = new Date();
		let year = now.getUTCFullYear();
		let month = now.getUTCMonth();
		if (!month) {
			year--;
			month = 11;
		} else {
			month--;
		}

		let limit = new Date(year, month, 1, 0, 0, 0, 0).getTime();

		for (let i in this.data) {
			if ('score' in this.data[i]) {
				/* CP 1-30 count as 1 to 1.
				 * CP 31-50 count as 1 CP = 0.5 TP
				 * CP 50+ count as  1 CP = 0.25 TP
				 */
				let tp = 0;
				let cpLeft = parseInt(this.data[i].score);
				if (cpLeft < 30) {
					tp += cpLeft;
				} else {
					tp += 30;
					cpLeft -= 30;
				}

				if (cpLeft < 20) {
					tp += Math.floor(cpLeft / 2);
				} else {
					tp += 10;
					cpLeft -= 20;
				}

				if (cpLeft > 0) {
					tp += Math.floor(cpLeft / 4);
				}

				if (tp > 0) {
					let db = redis.useDatabase('tours');
					const username = this.data[i].username;

					db.exists(`${WIFI_ROOM}:${i}`).then(exists => {
						if (!exists) {
							db.hmset(`${WIFI_ROOM}:${i}`, 'username', username, 'points', tp, 'total', tp);
						} else {
							db.hincrby(`${WIFI_ROOM}:${i}`, 'points', tp);
							db.hincrby(`${WIFI_ROOM}:${i}`, 'total', tp);
						}

						ChatHandler.sendMail('Kid A', i, `You have received ${tp} TP for your cloning efforts this month.`);
					});
				}

				this.data[i].score = 0;
			}
			let date = parseInt(this.data[i].date);
			if (!isNaN(date) && date < limit) {
				removed.push(i);
				ChatHandler.sendMail('Kid A', i, `You have been removed from the ${this.name} list due to inactivity.`);
				if (this.name === 'cloners') {
					if (!notes[i]) notes[i] = {};
					notes[i][Date.now()] = ['', "Purged from the list."];
				}
			}
		}
		fs.writeFile(`./data/${NOTES_FILE}`, JSON.stringify(notes), () => {});
		removed.forEach(userid => delete this.data[userid]);
		this.writeList();
		return removed;
	}

	loadList() {
		let users = Object.create(null);
		let data = '';
		try {
			data = fs.readFileSync(this.file);
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
		}
		data = ('' + data).split("\n");
		for (let i = 0; i < data.length; i++) {
			if (!data[i] || data[i] === '\r') continue;
			let row = data[i].trim().split("\t");
			if (row[0] === this.columnNames[0]) continue;

			let offset = 0;
			let key = '';
			if (row[0].startsWith('id:')) {
				offset++;
				key = toId(row[0].substr(3));
			} else {
				key = toId(row[0]);
			}
			users[key] = {};
			for (let j = 0; j < this.columnKeys.length; j++) {
				users[key][this.columnKeys[j]] = row[j + offset];
			}
		}

		return users;
	}

	renderEntry(key) {
		let values = [];
		for (let j in this.data[key]) values.push(this.data[key][j]);
		if (key !== toId(values[0])) values.unshift(`id:${key}`);
		return values.join('\t') + '\n';
	}

	writeList() {
		if (this.writing) {
			this.writePending = true;
			return;
		}
		this.writing = true;
		let toWrite = this.columnNames.join('\t') + "\n";
		for (let i in this.data) {
			toWrite += this.renderEntry(i);
		}
		fs.writeFile(this.file, toWrite, () => {
			this.writing = false;
			if (this.writePending) this.writeList();
		});
	}

	updateScore(userid, amount = 1, total) {
		if (!(this.data[userid] && ('score' in this.data[userid]))) return;

		total = total || amount;
		this.data[userid].score = parseInt(this.data[userid].score) + amount;
		this.data[userid].totalscore = parseInt(this.data[userid].totalscore) + total;

		this.writeList();
	}

	async getBannedFCs() {
		let fcs = [];
		let now = new Date();

		for (let key in this.data) {
			let val = this.data[key];
			if (typeof(val.date) === "string" && val.date.startsWith("PERMA")) {
				fcs = fcs.concat(val.fc.split(',').map(fc => fc.trim()));
			} else if (parseInt(val.date)) {
				let date = new Date(parseInt(val.date));

				if (!(date.getUTCFullYear() < now.getUTCFullYear() - 1 || (date.getUTCFullYear() < now.getUTCFullYear() && (date.getUTCMonth() < now.getUTCMonth() || (date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() < now.getUTCDate()))))) {
					fcs = fcs.concat(val.fc.split(',').map(fc => fc.trim()));
				}
			}
		}

		const shitters = await settings.lrange(`${WIFI_ROOM}:shitters`, 0, -1);

		return fcs.concat(shitters);
	}
}

const clonerList = new WifiList('cloners', './data/cloners.tsv', ['PS Username', 'Friend code', 'IGN', 'Notes', 'Monthly Score', 'Total Score', 'Date of last giveaway'], ['username', 'fc', 'ign', 'notes', 'score', 'totalscore']);
const scammerList = new WifiList('scammers', './data/scammers.tsv', ['PS Username', 'Alts', 'IGN', 'Friend code', 'Reason', 'Added by', 'Date added'], ['username', 'alts', 'ign', 'fc', 'reason', 'addedby']);
const hackmonList = new WifiList('hackmons', './data/hackmons.tsv', ['Pokémon', 'OT', 'TID', 'Details', 'Reasoning', 'Added By', 'Date Added'], ['species', 'ot', 'tid', 'details', 'reasoning', 'addedby'], true);

class ClonerLog {
	constructor() {
		this.db = redis.useDatabase('clonerlog');

		this.pendingRequests = {};
		this.thisDay = [];

		const midnight = new Date();
		// midnight EST
		midnight.setHours(29, 0, 0, 0);
		const resolver = () => {
			this.thisDay = [];
			this.timeout = setTimeout(resolver, DAY);
		};
		this.timeout = setTimeout(resolver, midnight.valueOf() - Date.now());

		let generatePage = async () => {
			let keys = (await this.db.keys('*')).sort((a, b) => parseInt(a) > parseInt(b) ? -1 : 1);

			let data = [];

			for (let key of keys) {
				let entry = (await this.db.get(key)).split(':');
				data.push({date: key, cloner: entry[0], client: entry[1]});
			}

			return data;
		};

		this.page = new Page('clonerlog', generatePage, 'clonerlog.html', {token: 'cloners', rooms: [WIFI_ROOM]});

		setInterval(() => {
			for (let key in this.pendingRequests) {
				if (this.pendingRequests[key].timestamp < Date.now() - DAY) {
					delete this.pendingRequests[key];
				}
			}
		}, DAY);
	}

	process(user, target, role) {
		let confirmkey = `${user}:${target}`;
		if (confirmkey in this.pendingRequests) {
			this.pendingRequests[confirmkey][role] = user;

			// failsafe
			if (!('cloner' in this.pendingRequests[confirmkey] && 'client' in this.pendingRequests[confirmkey])) return;

			this.log(this.pendingRequests[confirmkey]);
			ChatHandler.sendPM(user, `Cloning confirmed successfully.`);
			ChatHandler.sendPM(target, `${user} has confirmed the cloning.`);
			clonerList.updateScore(this.pendingRequests[confirmkey].cloner);
			delete this.pendingRequests[confirmkey];
		} else {
			if (role !== 'cloner') return ChatHandler.sendPM(user, `Only cloners can initiate a confirmation.`);
			let key = `${target}:${user}`;
			if (this.thisDay.includes(key)) return ChatHandler.sendPM(user, `You cannot claim more points from this client today.`);
			this.thisDay.push(key);
			let obj = {timestamp: Date.now(), cloner: user};
			this.pendingRequests[key] = obj;
			ChatHandler.sendPM(user, `Confirmation request sent to ${target}.`);
			ChatHandler.sendPM(target, `${user} wants you to confirm they cloned for you. If this is indeed the case, respond with \`\`.cloned ${user}\`\`. If you received this message randomly, please report this to a staff member.`);
		}
	}

	addPoints(user, target, amount) {
		this.log({timestamp: Date.now(), cloner: target, client: user});
		clonerList.updateScore(target, amount);
	}

	async log(obj) {
		await this.db.set(obj.timestamp, `${obj.cloner}:${obj.client}`);
		this.db.pexpire(obj.timestamp, MONTH);
	}
}

const clonerlog = new ClonerLog();
const clonernotes = new Page('clonernotes', async () => notes, 'clonernotes.html', {token: 'cloners', rooms: [WIFI_ROOM]});

function getScammerEntry(userid) {
	for (let key in scammerList.data) {
		if (key === userid) return key;

		let alts = scammerList.data[key].alts.split(',').map(alt => toId(alt));
		if (alts.includes(userid)) return key;
	}

	return false;
}

new Page('bannedfcs.xml', scammerList.getBannedFCs.bind(scammerList), 'bannedfcs.xml', {rooms: [WIFI_ROOM]});

module.exports = {
	onUserJoin: {
		rooms: [WIFI_ROOM],
		async action(user) {
			const userid = toId(user);
			const now = new Date();

			// Gen 8

			const scammers = await ChatHandler.queryProfile({wifiscammerinfo: ''});

			for (const scammerId in scammers) {
				const scammer = scammers[scammerId];
				if (scammerId === userid || (scammer.wifiscammeralts && scammer.wifiscammeralts.split(',').map(alt => toId(alt)).includes(userid))) {
					const date = new Date(parseInt(scammer.wifiscammeraddedtime));

					if (toId(scammer.wifiscammerinfo).startsWith('perma') || !(date.getUTCFullYear() < now.getUTCFullYear() - 1 || (date.getUTCFullYear() < now.getUTCFullYear() && (date.getUTCMonth() < now.getUTCMonth() || (date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() < now.getUTCDate()))))) {
						ChatHandler.send(WIFI_ROOM, `/rb ${user}, ${toId(scammer.wifiscammerinfo).startsWith('perma') ? 'Permabanned ' : ''}Scammer`);
					}

					const userinfo = await ChatHandler.query('whois', userid);

					ChatHandler.setProfileField(scammerId, 'wifiscammerfingerprint', `${scammer.wifiscammerfingerprint}${userinfo.ipStr.length && scammer.wifiscammerfingerprint.length ? '|' : ''}${userinfo.ipStr}`);
					if (scammerId !== userid) {
						userinfo.alts.push(user.slice(1));
					}
					ChatHandler.setProfileField(scammerId, 'wifiscammeralts', `${scammer.wifiscammeralts}${userinfo.alts.length && scammer.wifiscammeralts.length ? ', ' : ''}${userinfo.alts.join(', ')}`);

					ChatHandler.send(WIFI_ROOM, `/modnote ${user.slice(1)} was added${scammerId !== userid ? ` as an alt of ${scammer.username}` : ""} to the scammers database.`);
				}
			}

			// Legacy Gen 7 scammer code

			user = userid;
			let scammer = getScammerEntry(user);

			// Autoban permabanned scammers
			if (scammer) {
				if (typeof(scammerList.data[scammer].date) === "string" && scammerList.data[scammer].date.startsWith("PERMA")) {
					ChatHandler.send(WIFI_ROOM, `/rb ${user}, Permabanned scammer.`);
				} else if (parseInt(scammerList.data[scammer].date)) {
					let date = new Date(parseInt(scammerList.data[scammer].date));

					if (!(date.getUTCFullYear() < now.getUTCFullYear() - 1 || (date.getUTCFullYear() < now.getUTCFullYear() && (date.getUTCMonth() < now.getUTCMonth() || (date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() < now.getUTCDate()))))) {
						ChatHandler.send(WIFI_ROOM, `/rb ${user}, Scammer.`);
					}
				}
			}

			if (clonerList.data[user]) {
				if (now.getUTCDate > 26 && parseInt(clonerList.data[user].date)) {
					let date = new Date(parseInt(clonerList.data[user].date));
					if (date.getUTCMonth !== now.getUTCMonth) {
						if (cache.get('reminded').hasOwnProperty(user) && cache.get('reminded')[user] > Date.now() - 4 * HOUR) return;

						ChatHandler.sendPM(user, `Reminder: You have not done your cloner giveaway this month. If you fail to do this before the start of the new month, you will be purged from the list. NB: It's required to notify an editor of the cloner list that you've done your cloner GA.`);
						cache.setProperty('reminded', user, Date.now());
						cache.write();
					}
				}
			}
		},
	},
	commands: {
		addcloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				params.push(0, 0);
				return this.reply(clonerList.add(this.username, params));
			},
		},
		removecloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				return this.reply(clonerList.remove(this.username, toId(message)));
			},
		},
		updatecloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				let targetId = toId(params[0]);

				if (!(targetId in clonerList.data)) return this.pmreply("User is not on the cloner list.");
				let hasPerms = this.canUse(5) || (await settings.hexists('whitelist:cloners', this.userid));
				let self = !hasPerms && (this.userid === targetId);
				if (!(hasPerms || self)) return this.pmreply("Permission denied.");

				return this.reply(clonerList.update(this.username, params, self));
			},
		},
		purgecloners: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || Config.clonerLeader === this.userid)) return this.pmreply("Permission denied.");

				let removed = clonerList.purgeList();
				// Do 10 names per time. Max length for a modnote is 300, assuming all names are the max length (19 characters), plus 2 for the ', ' sep. This would fit 14 names, but doing 10 since I need space for the rest of the message.
				for (let i = 0; i < removed.length; i += 10) {
					ChatHandler.send(WIFI_ROOM, `/modnote ${removed.slice(i, i + 10)} ${i === removed.length - 1 ? 'was' : 'were'} removed from the cloner list`);
				}
				cache.set('reminded', {});
				return this.reply(`${removed.length} user${(removed.length === 1 ? ' was' : 's were')} removed from the cloner list.`);
			},
		},
		whitelistcloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || Config.clonerLeader === this.userid)) return this.pmreply("Permission denied.");

				if (await settings.hexists('whitelist:cloners', toId(message))) return this.reply("This user is already whitelisted.");

				await settings.hset('whitelist:cloners', toId(message), message);
				ChatHandler.send(WIFI_ROOM, `/modnote ${toId(message)} was whitelisted for the cloner list by ${this.username}.`);
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelistcloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || Config.clonerLeader === this.userid)) return this.pmreply("Permission denied.");

				if (!await settings.hexists('whitelist:cloners', toId(message))) return this.reply("This user isn't whitelisted.");

				await settings.hdel('whitelist:cloners', toId(message));
				ChatHandler.send(WIFI_ROOM, `/modnote ${toId(message)} was unwhitelisted for the cloner list by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		setclonerflag: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let [user, flag] = message.split(',').map(param => param.trim());

				user = toId(user);
				if (!(user in clonerList.data)) return this.reply("User is not on the cloner list.");

				if (flag) {
					flag = flag.toUpperCase();

					clonerList.data[user].date = flag;

					clonerList.writeList();
					ChatHandler.send(WIFI_ROOM, `/modnote ${user}'s cloner flag was set to ${flag} by ${this.username}.`);
				} else {
					clonerList.data[user].date = Date.now();
					clonerList.writeList();

					ChatHandler.send(WIFI_ROOM, `/modnote ${user}'s cloner flag was removed by ${this.username}.`);
				}

				return this.reply("User's flag has been successfully updated.");
			},
		},
		editcloners: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let permission = this.canUse(5) || await settings.hexists('whitelist:cloners', this.userid);
				let editSelf = (this.userid in clonerList.data);
				if (!(permission || editSelf)) return this.pmreply("Permission denied.");

				const url = clonerList.page.getUrl(WIFI_ROOM, this.userid, true, {}, false, {permission: permission});
				this.pmreply(`Edit link for the cloner list **DON'T SHARE THIS LINK**: ${url}`);
			},
		},
		notifycloners: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");
				if (!message) return this.pmreply("Please enter a message.");

				for (let i in clonerList.data) {
					ChatHandler.sendMail(this.username, i, message);
				}

				return this.reply("New cloner notification set.");
			},
		},
		cloned: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.userlists[WIFI_ROOM][this.userid]) return this.pmreply("You need to be in the Wi-Fi room to use this command.");
				if (this.auth === '‽') return this.pmreply("You cannot use this command while locked."); // Needed so we can lock for abuse.

				message = toId(message);
				if (!message) return this.pmreply("Syntax: ``.cloned username``");

				let userIsCloner = !!clonerList.data[this.userid];
				let targetIsCloner = !!clonerList.data[message];

				if (!(userIsCloner ^ targetIsCloner)) return this.pmreply("This command can only be used by a cloner on a client and vice-versa.");

				clonerlog.process(this.userid, message, (userIsCloner ? 'cloner' : 'client'));
			},
		},
		addcp: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(2) || await this.settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				let [username, points] = message.split(',').map(param => param.trim());
				points = parseInt(points);
				let userid = toId(username);
				if (!userid || !points || points < 0) return this.pmreply("Syntax error. ``.addcp username, amount``");
				userid = toId(userid);

				clonerList.updateScore(userid, points);

				return this.reply(`${points} cloner points added for ${username}.`);
			},
		},
		removecp: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(2) || await this.settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				let [username, points] = message.split(',').map(param => param.trim());
				points = parseInt(points);
				let userid = toId(username);
				if (!userid || !points || points < 0) return this.pmreply("Syntax error. ``.removecp username, amount, remove from total``");
				userid = toId(userid);

				clonerList.updateScore(userid, -1 * points, -1 * points);

				return this.reply(`${points} cloner points removed from ${username}.`);
			},
		},
		clonerlog: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				const url = clonerlog.page.getUrl(WIFI_ROOM, this.userid);
				this.pmreply(`Cloner log: ${url}`);
			},
		},
		clonernote: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				let [username, ...note] = message.split(',');
				username = toId(username);
				note = note.join(',').trim();
				if (!username || !note) return this.pmreply("Invalid syntax. ``.clonernote username, note``");

				if (!notes[username]) notes[username] = {};
				notes[username][Date.now()] = [this.username, note];
				ChatHandler.send(WIFI_ROOM, `/modnote ${username}: ${note} -${this.username}`);
				fs.writeFile(`./data/${NOTES_FILE}`, JSON.stringify(notes), () => this.reply("Note created."));
			},
		},
		clonernotes: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				const url = clonernotes.getUrl(WIFI_ROOM, this.userid);
				this.pmreply(`Cloner notes: ${url}`);
			},
		},

		addscammer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				params.push(this.username);
				return this.reply(scammerList.add(this.username, params));
			},
		},
		removescammer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				return this.reply(scammerList.remove(this.username, toId(message)));
			},
		},
		updatescammer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());

				if (!(toId(params[0]) in scammerList.data)) return this.pmreply("User is not on the scammer list.");

				return this.reply(scammerList.update(this.username, params));
			},
		},
		addscammeralt: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let params = message.split(',').map(param => param.trim());
				let targetId = toId(params[0]);

				if (!(targetId in scammerList.data)) return this.pmreply("User is not on the scammer list.");

				return this.reply(scammerList.update(this.username, [targetId, 'alts:' + scammerList.data[targetId].alts + ', ' + params.slice(1).join(', ')]));
			},
		},
		checkfc: {
			rooms: [WIFI_ROOM],
			permission: 1,
			async action(message) {
				const fc = Utils.toFc(message);

				if (!fc) return this.reply("Syntax error: ``.checkfc friend code``");

				if (!Utils.validateFc(fc)) return this.reply("This FC is invalid.");

				let output = [];
				let search = true;

				// Firstly, check the scammer list
				for (let i in scammerList.data) {
					let split = scammerList.data[i].fc.split(',').map(param => param.trim());

					for (let thisfc of split) {
						if (thisfc === fc) {
							output.push(`This FC belongs to ${scammerList.data[i].username}, who <b>${scammerList.data[i].date.startsWith && scammerList.data[i].date.startsWith("PERMA") ? 'is a permabanned scammer' : `was added to the scammers list on ${(new Date(parseInt(scammerList.data[i].date))).toDateString()}`}</b>.`);
							output.push(`Reason: ${scammerList.data[i].reason}`);
							search = false;
							break;
						}
					}
				}

				// Then, check all the other lists
				if (search) {
					for (let i in clonerList.data) {
						if (clonerList.data[i].fc === fc) {
							output.push(`This FC belongs to ${clonerList.data[i].username}, who is an approved cloner.`);
							search = false;
							break;
						}
					}
				}

				// Lastly, if available, check the .fc database
				if (search) {
					let db = redis.useDatabase('friendcodes');

					let fcs = await db.keys('*');
					let results = [];

					for (let i = 0; i < fcs.length; i++) {
						const entry = await db.get(fcs[i]);
						if (entry.split(':').includes(fc)) results.push(fcs[i]);
					}
					if (results.length) output.push(`This FC belongs to ${results.join(', ')}.`);

					const shitters = await this.settings.lrange(`${WIFI_ROOM}:shitters`, 0, -1);
					if (shitters.includes(fc)) output.push(`<b>This is a bad user. Notify a staff member right away.</b>`);
				}

				if (output.length) return this.replyHTML(output.join('<br/>'));

				return this.reply("This FC was not found.");
			},
		},
		setscammerflag: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let [user, flag] = message.split(',').map(param => param.trim());

				user = toId(user);
				if (!(user in scammerList.data)) return this.reply("User is not on the scammer list.");

				if (flag) {
					flag = flag.toUpperCase();

					scammerList.data[user].date = flag;

					scammerList.writeList();
					ChatHandler.send(WIFI_ROOM, `/modnote ${user}'s scammer flag was set to ${flag} by ${this.username}.`);
				} else {
					scammerList.data[user].date = Date.now();
					scammerList.writeList();

					ChatHandler.send(WIFI_ROOM, `/modnote ${user}'s scammer flag was removed by ${this.username}.`);
				}

				return this.reply("User's flag has been successfully updated.");
			},
		},
		addhackmon: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				params.push(this.username);
				let date = new Date();
				return this.reply(hackmonList.add(this.username, params, `${params[0]}-${leftpad(date.getUTCDate())}-${leftpad(date.getUTCMonth() + 1)}-${leftpad(date.getUTCFullYear() - 2000)}`));
			},
		},
		removehackmon: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				return this.reply(hackmonList.remove(this.username, toId(message)));
			},
		},
		updatehackmon: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());

				if (!(toId(params[0]) in hackmonList.data)) return this.pmreply("This mon isn't on the hackmon list.");

				return this.reply(hackmonList.update(this.username, params));
			},
		},
		markscammer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let [target, scammer] = message.split(',').map(param => param.trim());

				if (!target || !scammer) return this.reply("Syntax: ``.markscammer user, asScammer``");

				const scammerProfile = await ChatHandler.getProfile(toId(scammer));
				if (!scammerProfile || !scammerProfile.wifiscammeraddedtime) return this.reply("Scammer not found.");

				const userinfo = await ChatHandler.query('whois', toId(target));

				ChatHandler.setProfileField(toId(scammer), 'wifiscammeralts', `${scammerProfile.wifiscammeralts}, ${target}`);
				if (userinfo.ipStr) {
					let fingerprintStr = userinfo.ipStr;
					if (scammerProfile.wifiscammerfingerprint) fingerprintStr = scammerProfile.wifiscammerfingerprint + '|' + fingerprintStr;
					ChatHandler.setProfileField(toId(scammer), 'wifiscammerfingerprint', fingerprintStr);
				}

				ChatHandler.send(WIFI_ROOM, `/modnote ${target} was marked as an alt of the scammer ${scammer}.`);
			},
		},
		checkscammer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (this.userlists[WIFI_ROOM] && this.userlists[WIFI_ROOM][this.userid]) {
					this.auth = this.userlists[WIFI_ROOM][this.userid][0];
				}

				if (!toId(message)) return this.reply("Please enter a username");

				const showAll = this.canUse(3);

				const rows = [];

				const profile = await ChatHandler.getProfile(toId(message));

				// Check if someone is a scammer directly. If someone is an exact match we can just say it and skip the rest of the queries.
				if (profile) {
					if (profile.wifiscammeraddedtime) {
						rows.push(`This user is on the scammers list!`, `Reason: <code>${profile.wifiscammerinfo}</code>`);
						if (showAll) rows.push(`Alts: ${profile.wifiscammeralts || 'None'}`);
					}

					if (profile.wificlonerinfo) {
						rows.push(`This user is an approved cloner and trusted user.`);
					}
				}

				let suspicion = 0;

				if (!rows.length) {
					// Get fingerprints and other info
					const userinfo = await ChatHandler.query('whois', toId(message));

					if (profile) {
						if (profile.wifiign) {
							// Check IGN
							const res = await ChatHandler.queryProfile({wifiign: profile.wifiign, wifiscammeraddedtime: ''});
							const num = Object.keys(res).length;
							if (num) {
								// If we match too many it's not really accurate identification.
								if (num === 1) suspicion++;
								if (showAll) rows.push(`IGN  match: ${Object.keys(res).join(', ')}`);
							}
						}

						if (profile.switchfc) {
							// Check FC
							const res = await ChatHandler.queryProfile({switchfc: profile.switchfc, wifiscammeraddedtime: ''});
							if (Object.keys(res).length) {
								suspicion++;
								if (showAll) rows.push(`FC match: ${Object.keys(res).join(', ')}`);
							}
						}
					}

					// Users on proxies are always suspicious, but we can't do much with IP checks.
					if (userinfo.isProxy) {
						// Especially unregistered users
						if (userinfo.unregistered) suspicion += 2;
						suspicion++;
					} else if (userinfo.ipStr) {
						// Check fingerprint
						const ips = userinfo.ipStr.split('|');

						for (const ip of ips) {
							const res = await ChatHandler.queryProfile({wifiscammerfingerprint: ip});

							if (res.length) {
								suspicion += 3;
								if (showAll) rows.push(`Fingerprint match: ${Object.keys(res).join(', ')}`);
							}
						}
					}

					// Check alts
					if (userinfo.alts) {
						for (const alt of userinfo.alts) {
							const res = await ChatHandler.queryProfile({wifiscammeralts: alt});

							if (res.length) {
								suspicion += 3;
								if (showAll) rows.push(`Alt match: ${Object.keys(res).join(', ')}`);
							}
						}
					}

					if (!showAll) {
						if (!suspicion) {
							rows.push("Nothing suspicious found for this user.");
						} else if (suspicion < 3) {
							rows.push("This user seems somewhat suspicious, be sure to know who you're trading with.");
						} else if (suspicion < 5) {
							rows.push("This user definitely seems suspicious, ask a Moderator to be sure before trading.");
						} else {
							rows.push("This user is very suspicious. Alert a Moderator!");
						}
					}
				}

				this.replyHTML(rows.join('<br/>'));
			},
		},
	},
	analyzer: {
		rooms: [WIFI_ROOM],
		async modnoteParser(message) {
			let match = /^(.+?) started a (.+?) giveaway for (.+?)$/.exec(message);

			if (match) {
				if (match[2] !== 'GTS') ChatHandler.send(WIFI_ROOM, `It's Giveaway Time!`);

				if ((await profile.hexists(toId(match[3]), 'wificlonerlastgatime'))) {
					profile.hset(toId(match[3]), 'wificlonerlastgatime', Date.now());
				}

				if (clonerList.data[toId(match[3])]) {
					clonerList.data[toId(match[3])].date = Date.now();
					clonerList.writeList();
				}

				let date = new Date();

				this.data.hincrby(`giveaways`, date.getUTCHours(), 1);
			}

			match = /^(.+?) was demoted to Room (?:Voice|regular user) by (.+?)\.$/.exec(message);

			if (match && (await settings.hexists('whitelist:cloners', toId(match[1])))) {
				await settings.hdel('whitelist:cloners', toId(match[1]));
			}
		},
	},
};
