'use strict';

const fs = require('fs');

const server = require('../server.js');
const redis = require('../redis.js');
const utils = require('../utils.js');
const Cache = require('../cache.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

const FC_REGEX = /[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}/;

const WIFI_ROOM = 'wifi';
const NOTES_FILE = 'clonernotes.json';

const settings = redis.useDatabase('settings');

const cache = new Cache('wifi');

server.addTemplate('cloners', 'cloners.html');
server.addTemplate('clonerlog', 'clonerlog.html');
server.addTemplate('clonernotes', 'clonernotes.html');

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

		let changeList = (tokenData, edits) => {
			if (tokenData.list !== this.name || !(tokenData.permission || tokenData.user)) return;

			if (!tokenData.permission && (Object.keys(edits).length && !(tokenData.user in edits))) return;

			for (let i in edits) {
				if (!this.data[i]) return;
				for (let key in edits[i]) {
					if (key === 'score' || key === 'username' || (key === 'date' && !tokenData.permission)) continue;

					let elem = edits[i][key];
					if (key === 'fc') {
						if (!tokenData.permission) continue;
						if (!FC_REGEX.test(elem)) continue;
						elem = toId(elem);
						elem = elem.substr(0, 4) + '-' + elem.substr(4, 4) + '-' + elem.substr(8, 4);
						if (!utils.validateFc(elem)) continue;
					}
					this.data[i][key] = elem;
				}
				if (!this.data[i].date) this.data[i].date = Date.now();
				Connection.send(`${WIFI_ROOM}|/modnote ${tokenData.user} updated ${i}'s ${this.name.slice(0, -1)} info.`);
			}

			this.writeList();
		};

		let parseQuery = (tokenData, queryData) => {
			if (!queryData.edits) return;

			let edits = {};

			for (let i in queryData.edits) {
				if (Object.keys(queryData.edits[i]).some(val => !this.columnKeys.includes(val))) return;
				edits[i] = queryData.edits[i];
			}

			changeList(tokenData, edits);
		};

		let generatePage = async (req, res) => {
			let query = server.parseURL(req.url);
			let token = query.token;

			let data = {name: this.name, columnNames: this.columnNames, noOnline: this.noOnlinePage};

			if (token) {
				let tokenData = server.getAccessToken(token);
				if (!tokenData) return res.end('Invalid access token.');

				data.tokenData = tokenData;

				if (req.method === "POST") {
					if (!(req.body && req.body.data)) return res.end("Malformed request.");
					let queryData;
					try {
						queryData = JSON.parse(decodeURIComponent(req.body.data));
						console.log(queryData);
					} catch (e) {
						return res.end("Malformed JSON.");
					}
					parseQuery(tokenData, queryData);
				}
			}

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
			}).map(val => ({data: this.data[val], online: (!this.noOnlinePage && (Handler.userlists[WIFI_ROOM] && (val in Handler.userlists[WIFI_ROOM] || (this.data[val].alts && this.data[val].alts.split(',').map(val => toId(val)).filter(val => val in Handler.userlists[WIFI_ROOM]).length))))}));

			return res.end(server.renderTemplate('cloners', data));
		};

		server.addRoute(`/${WIFI_ROOM}/${this.name}`, generatePage);
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
					if (!FC_REGEX.test(fc)) return "Invalid formatting for Friend Code. format: ``1111-2222-3333``";
					fc = toId(fc);
					split[i] = `${fc.substr(0, 4)}-${fc.substr(4, 4)}-${fc.substr(8, 4)}`;
					if (!utils.validateFc(fc)) return "The Friend code you entered is invalid";
				}

				params[i] = split.join(', ');
			}
			data[this.columnKeys[i]] = params[i];
		}
		this.data[key] = data;
		fs.appendFile(this.file, this.renderEntry(key), () => {});

		Connection.send(`${WIFI_ROOM}|/modnote ${user} added ${key} to the ${this.name.slice(0, -1)} list.`);
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
		Connection.send(`${WIFI_ROOM}|/modnote ${user} deleted ${target} from the ${this.name.slice(0, -1)} list.`);
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
					if (!FC_REGEX.test(fc)) return "Invalid formatting for Friend Code. format: ``1111-2222-3333``";
					fc = toId(fc);
					split[i] = fc.substr(0, 4) + '-' + fc.substr(4, 4) + '-' + fc.substr(8, 4);
					if (!utils.validateFc(fc)) return "The Friend code you entered is invalid";
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
		Connection.send(`${WIFI_ROOM}|/modnote ${user} updated ${(toId(user) === identifier ? 'their' : `${identifier}'s`)} ${this.name.slice(0, -1)} info.`);
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
			if ('score' in this.data[i]) this.data[i].score = 0;
			let date = parseInt(this.data[i].date);
			if (!isNaN(date) && date < limit) {
				removed.push(i);
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
		let toWrite = this.columnNames.join('\t') + "\n";
		for (let i in this.data) {
			toWrite += this.renderEntry(i);
		}
		fs.writeFile(this.file, toWrite, () => {});
	}

	updateScore(userid) {
		if (!(this.data[userid] && ('score' in this.data[userid]))) return;

		this.data[userid].score = parseInt(this.data[userid].score) + 1;
		this.data[userid].totalscore = parseInt(this.data[userid].totalscore) + 1;

		this.writeList();
	}
}

const clonerList = new WifiList('cloners', './data/cloners.tsv', ['PS Username', 'Friend code', 'IGN', 'Notes', 'Monthly Score', 'Total Score', 'Date of last giveaway'], ['username', 'fc', 'ign', 'notes', 'score', 'totalscore']);
const scammerList = new WifiList('scammers', './data/scammers.tsv', ['PS Username', 'Alts', 'IGN', 'Friend code', 'Evidence', 'Reason', 'Added by', 'Date added'], ['username', 'alts', 'ign', 'fc', 'evidence', 'reason', 'addedby']);
const hackmonList = new WifiList('hackmons', './data/hackmons.tsv', ['Pokémon', 'OT', 'TID', 'Details', 'Reasoning', 'Notes', 'Added By', 'Date Added'], ['species', 'ot', 'tid', 'details', 'reasoning', 'notes', 'addedby'], true);

class ClonerLog {
	constructor() {
		this.db = redis.useDatabase('clonerlog');

		this.pendingRequests = {};

		let generatePage = async (req, res) => {
			let query = server.parseURL(req.url);
			let token = query.token;

			if (!token) return res.end("No access token provided.");

			let tokenData = server.getAccessToken(token);
			if (!tokenData || tokenData.permission !== 'cloners') return res.end('Invalid access token.');

			let keys = (await this.db.keys('*')).sort((a, b) => parseInt(a) > parseInt(b) ? -1 : 1);

			let data = [];

			for (let key of keys) {
				let entry = (await this.db.get(key)).split(':');
				data.push({date: key, cloner: entry[0], client: entry[1]});
			}

			return res.end(server.renderTemplate('clonerlog', data));
		};

		server.addRoute(`/${WIFI_ROOM}/clonerlog`, generatePage);

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
			Connection.send(`|/pm ${user}, Cloning confirmed successfully.`);
			Connection.send(`|/pm ${target}, ${user} has confirmed the cloning.`);
			clonerList.updateScore(this.pendingRequests[confirmkey].cloner);
			delete this.pendingRequests[confirmkey];
		} else {
			if (role !== 'cloner') return Connection.send(`|/pm ${user}, Only cloners can initiate a confirmation.`);
			let key = `${target}:${user}`;
			let obj = {timestamp: Date.now(), cloner: user};
			this.pendingRequests[key] = obj;
			Connection.send(`|/pm ${user}, Confirmation request sent to ${target}.`);
			Connection.send(`|/pm ${target}, ${user} wants you to confirm they cloned for you. If this is indeed the case, respond with \`\`.cloned ${user}\`\`. If you received this message randomly, please report this to a staff member.`);
		}
	}

	async log(obj) {
		await this.db.set(obj.timestamp, `${obj.cloner}:${obj.client}`);
		this.db.pexpire(obj.timestamp, MONTH);
	}
}

const clonerlog = new ClonerLog();

async function generateNotePage (req, res) {
	let query = server.parseURL(req.url);
	let token = query.token;

	if (!token) return res.end("No access token provided.");

	let tokenData = server.getAccessToken(token);
	if (!tokenData || tokenData.permission !== 'cloners') return res.end('Invalid access token.');

	return res.end(server.renderTemplate('clonernotes', notes));
}

server.addRoute(`/${WIFI_ROOM}/clonernotes`, generateNotePage);

function getScammerEntry(userid) {
	for (let key in scammerList.data) {
		if (key === userid) return key;

		let alts = scammerList.data[key].alts.split(',').map(alt => toId(alt));
		if (alts.includes(userid)) return key;
	}

	return false;
}

module.exports = {
	onUserJoin: {
		rooms: [WIFI_ROOM],
		action(user) {
			user = toId(user);

			let now = new Date();
			let scammer = getScammerEntry(user);

			// Autoban permabanned scammers
			if (scammer) {
				if (typeof(scammerList.data[scammer].date) === "string" && scammerList.data[scammer].date.startsWith("PERMA")) {
					Connection.send(`${WIFI_ROOM}|/rb ${user}, Permabanned scammer.`);
				} else if (parseInt(scammerList.data[scammer].date)) {
					let date = new Date(parseInt(scammerList.data[scammer].date));

					if (!(date.getUTCFullYear() < now.getUTCFullYear() - 1 || (date.getUTCFullYear() < now.getUTCFullYear() && (date.getUTCMonth() < now.getUTCMonth() || (date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() < now.getUTCDate()))))) {
						Connection.send(`${WIFI_ROOM}|/rb ${user}, Scammer.`);
					}
				}
			}

			if (clonerList.data[user]) {
				if (cache.get('messages').cloners && !cache.get('notified').hasOwnProperty(user)) {
					Connection.send(`|/pm ${user}, ${cache.get('messages').cloners}`);
					cache.setProperty('notified', user, 1);
					cache.write();
				}

				if (now.getUTCDate > 26 && parseInt(clonerList.data[user].date)) {
					let date = new Date(parseInt(clonerList.data[user].date));
					if (date.getUTCMonth !== now.getUTCMonth) {
						if (cache.get('reminded').hasOwnProperty(user) && cache.get('reminded')[user] > Date.now() - 4 * HOUR) return;

						Connection.send(`|/pm ${user}, Reminder: You have not done your cloner giveaway this month. If you fail to do this before the start of the new month, you will be purged from the list. NB: It's required to notify an editor of the cloner list that you've done your cloner GA.`);
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
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let removed = clonerList.purgeList();
				// Do 10 names per time. Max length for a modnote is 300, assuming all names are the max length (19 characters), plus 2 for the ', ' sep. This would fit 14 names, but doing 10 since I need space for the rest of the message.
				for (let i = 0; i < removed.length; i += 10) {
					Connection.send(`${WIFI_ROOM}|/modnote ${removed.slice(i, i + 10)} ${i === removed.length - 1 ? 'was' : 'were'} removed from the cloner list`);
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
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (await settings.hexists('whitelist:cloners', toId(message))) return this.reply("This user is already whitelisted.");

				await settings.hset('whitelist:cloners', toId(message), message);
				Connection.send(`${WIFI_ROOM}|/modnote ${toId(message)} was whitelisted for the cloner list by ${this.username}.`);
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelistcloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (!await settings.hexists('whitelist:cloners', toId(message))) return this.reply("This user isn't whitelisted.");

				await settings.hdel('whitelist:cloners', toId(message));
				Connection.send(`${WIFI_ROOM}|/modnote ${toId(message)} was unwhitelisted for the cloner list by ${this.username}.`);
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
					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s cloner flag was set to ${flag} by ${this.username}.`);
				} else {
					clonerList.data[user].date = Date.now();
					clonerList.writeList();

					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s cloner flag was removed by ${this.username}.`);
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

				if (Config.checkIps) {
					let [, ips] = await Handler.checkIp(this.userid);
					let data = {list: 'cloners'};
					if (permission) {
						data.permission = true;
					}
					data.user = this.userid;
					if (ips) data.ip = ips[0];
					let token = server.createAccessToken(data, 15);
					this.pmreply(`Edit link for the cloner list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/cloners?token=${token}`);
				} else {
					let data = {list: 'cloners'};
					if (permission) {
						data.permission = true;
					}
					data.user = this.userid;
					let token = server.createAccessToken(data, 15);
					this.pmreply(`Edit link for the cloner list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/cloners?token=${token}`);
				}
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

				cache.setProperty('messages', 'cloners', `${message.trim()} -${this.username}`);
				cache.set('notified', {});

				cache.write();

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
		clonerlog: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				let token = server.createAccessToken({permission: 'cloners'}, 60);
				this.pmreply(`Cloner log: ${server.url}${WIFI_ROOM}/clonerlog?token=${token}`);
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
				Connection.send(`${WIFI_ROOM}|/modnote ${username}: ${note} -${this.username}`);
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

				let token = server.createAccessToken({permission: 'cloners'}, 60);
				this.pmreply(`Cloner notes: ${server.url}${WIFI_ROOM}/clonernotes?token=${token}`);
			},
		},

		addscammer: {
			rooms: [WIFI_ROOM],
			action(message) {
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
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				return this.reply(scammerList.remove(this.username, toId(message)));
			},
		},
		updatescammer: {
			rooms: [WIFI_ROOM],
			action(message) {
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
			action(message) {
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
				let id = toId(message);
				if (!(id.length === 12 && parseInt(id))) return this.reply("Invalid input.");

				let fc = `${id.substr(0, 4)}-${id.substr(4, 4)}-${id.substr(8, 4)}`;

				if (!utils.validateFc(fc)) return this.reply("This FC is invalid.");

				// Firstly, check the scammer list
				for (let i in scammerList.data) {
					let split = scammerList.data[i].fc.split(',').map(param => param.trim());

					for (let thisfc of split) {
						if (thisfc === fc) {
							this.reply(`This FC belongs to ${scammerList.data[i].username}, who is ${typeof(scammerList.data[i].date) === "string" && scammerList.data[i].date.startsWith("PERMA") ? 'a permabanned scammer' : 'on the scammers list'}.`);
							return this.reply(`Reason: ${scammerList.data[i].reason}`);
						}
					}
				}

				// Then, check all the other lists
				for (let i in clonerList.data) {
					if (clonerList.data[i].fc === fc) return this.reply(`This FC belongs to ${clonerList.data[i].username}, who is an approved cloner.`);
				}

				// Lastly, if available, check the .fc database
				let db = redis.useDatabase('friendcodes');

				let fcs = await db.keys('*');

				for (let i = 0; i < fcs.length; i++) {
					if ((await db.get(fcs[i])) === fc) return this.reply(`This FC belongs to ${fcs[i]}.`);
				}

				return this.reply("This FC was not found.");
			},
		},
		setscammerflag: {
			rooms: [WIFI_ROOM],
			action(message) {
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
					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s scammer flag was set to ${flag} by ${this.username}.`);
				} else {
					scammerList.data[user].date = Date.now();
					scammerList.writeList();

					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s scammer flag was removed by ${this.username}.`);
				}

				return this.reply("User's flag has been successfully updated.");
			},
		},
		addhackmon: {
			rooms: [WIFI_ROOM],
			action(message) {
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
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				return this.reply(hackmonList.remove(this.username, toId(message)));
			},
		},
		updatehackmon: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());

				if (!(toId(params[0]) in hackmonList.data)) return this.pmreply("This mon isn't on the hackmon list.");

				return this.reply(hackmonList.update(this.username, params));
			},
		},
	},
	analyzer: {
		rooms: [WIFI_ROOM],
		async modnoteParser(message) {
			let match = /^(.+?) started a (.+?) giveaway for (.+?)$/.exec(message);

			if (match) {
				if (match[2] !== 'GTS') Connection.send(`${WIFI_ROOM}|It's Giveaway Time!`);
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
