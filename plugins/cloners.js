'use strict';

const fs = require('fs');

const server = require('../server.js');
const redis = require('../redis.js');
const utils = require('../utils.js');

const WEEK = 7 * 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const FC_REGEX = /[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}/;

const WIFI_ROOM = 'wifi';

const settings = redis.useDatabase('settings');

server.addTemplate('cloners', 'cloners.html');

class WifiList {
	constructor(name, file, columnNames, columnKeys, noOnlinePage, noTime) {
		this.name = name;
		this.file = file;
		this.columnNames = columnNames;
		this.columnKeys = columnKeys;
		this.noTime = noTime;

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
					if (key === 'username'|| (key === 'date' && !tokenData.permission)) continue;

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

			let data = {name: this.name, columnNames: this.columnNames};

			if (token) {
				let tokenData = server.getAccessToken(token);
				console.log(tokenData);
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
				let i = 0;
				while (a[i] === b[i]) {
					i++;
					if (i === a.length) return -1;
					if (i === b.length) return 1;
				}
				if (a[i] < b[i]) return -1;
				if (a[i] > b[i]) return 1;
				return 0;
			}).map(val => ({data: this.data[val], online: (Handler.userlists[WIFI_ROOM] && (val in Handler.userlists[WIFI_ROOM]))}));

			return res.end(server.renderTemplate('cloners', data));
		};

		server.addRoute('/' + WIFI_ROOM + '/' + this.name, generatePage);
	}

	addUser(user, params) {
		if (params.length !== this.columnKeys.length - (this.noTime ? 0 : 1)) return "Invalid amount of arguments";
		if (toId(params[0]) in this.data) return "'" + params[0] + "' is already a " + this.name.slice(0, -1) + ".";

		let userid = toId(params[0]);
		let data = {};
		if (!this.noTime) {
			params.push(Date.now());
		}
		for (let i = 0; i < this.columnKeys.length; i++) {
			// Validate friend codes
			if (this.columnKeys[i] === 'fc') {
				let split = params[i].split(',').map(param => param.trim());

				for (let fc of split) {
					if (!FC_REGEX.test(fc)) return "Invalid formatting for Friend Code. format: ``1111-2222-3333``";
					fc = toId(fc);
					fc = fc.substr(0, 4) + '-' + fc.substr(4, 4) + '-' + fc.substr(8, 4);
					if (!utils.validateFc(fc)) return "The Friend code you entered is invalid";
				}

				params[i] = split.join(', ');
			}
			data[this.columnKeys[i]] = params[i];
		}
		this.data[userid] = data;
		fs.appendFileSync(this.file, params.join('\t') + '\n');

		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' added ' + toId(params[0]) + ' to the ' + this.name.slice(0, -1) + ' list.');

		return "'" + params[0] + "' was successfully added to the " + this.name.slice(0, -1) + " list.";
	}

	removeUser(user, target) {
		if (!(target in this.data)) return "User is not on the " + this.name.slice(0, -1) + " list.";
		delete this.data[target];
		this.writeList();
		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' deleted ' + target + ' from the ' + this.name.slice(0, -1) + ' list.');
		return "User successfully removed.";
	}

	updateUser(user, params) {
		if (params.length < 2) return "Invalid number of arguments provided.";

		let userid = toId(params[0]);
		for (let i = 1; i < params.length; i++) {
			let [key, ...values] = params[i].split(':');
			if (!key || !values.length) return "Syntax error.";

			key = toId(key);
			let value = values.join(':').trim();

			if (key === 'username' || key === 'date') return "This column can't be changed.";
			if (!this.columnKeys.includes(key)) return `Invalid key: ${key}`;

			if (key === 'fc') {
				let split = value.split(',').map(param => param.trim());

				for (let fc of split) {
					if (!FC_REGEX.test(fc)) return "Invalid formatting for Friend Code. format: ``1111-2222-3333``";
					fc = toId(fc);
					fc = fc.substr(0, 4) + '-' + fc.substr(4, 4) + '-' + fc.substr(8, 4);
					if (!utils.validateFc(fc)) return "The Friend code you entered is invalid";
				}

				value = split.join(', ');
			}

			this.data[userid][key] = value;
		}

		this.writeList();
		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' updated ' + (toId(user) === userid ? 'their' : userid + "'s'") + ' ' + this.name.slice(0, -1) + ' info.');
		return "User successfully updated.";
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
			let date = parseInt(this.data[i].date);
			if (!isNaN(date) && date < limit) {
				removed.push(i);
			}
		}
		removed.forEach(userid => delete this.data[userid]);
		this.writeList();
		return removed;
	}

	loadList() {
		let users = Object.create(null);
		let data;
		try {
			data = fs.readFileSync(this.file);
		} catch (e) {
			return;
		}
		data = ('' + data).split("\n");
		for (let i = 0; i < data.length; i++) {
			if (!data[i] || data[i] === '\r') continue;
			let row = data[i].trim().split("\t");
			if (row[0] === this.columnNames[0]) continue;

			let userid = toId(row[0]);
			users[userid] = {};
			for (let i = 0; i < this.columnKeys.length; i++) {
				users[userid][this.columnKeys[i]] = row[i];
			}
		}

		return users;
	}

	writeList() {
		let toWrite = this.columnNames.join('\t') + "\n";
		for (let i in this.data) {
			let values = [];
			for (let j in this.data[i]) values.push(this.data[i][j]);
			toWrite += values.join('\t') + '\n';
		}
		fs.writeFileSync(this.file, toWrite);
	}
}

const clonerList = new WifiList('cloners', './data/cloners.tsv', ['PS Username', 'Friend code', 'IGN', 'Notes', 'Date of last giveaway'], ['username', 'fc', 'ign', 'notes']);
//const trainerList = new WifiList('trainers', './data/trainers.tsv', ['PS Username', 'IGN', 'Friend code', 'EV Spread Type', 'How many simultaneously', 'Notes', 'Date of last activity check'], ['username', 'ign', 'fc', 'evs', 'collateral', 'notes']);
const scammerList = new WifiList('scammers', './data/scammers.tsv', ['PS Username', 'Alts', 'IGN', 'Friend code', 'Evidence', 'Reason', 'Added by', 'Date added'], ['username', 'alts', 'ign', 'fc', 'evidence', 'reason', 'addedby'], true);

let notified = {};

module.exports = {
	onUserJoin: {
		rooms: [WIFI_ROOM],
		action(user) {
			user = toId(user);

			// Autoban permabanned scammers
			if (scammerList.data[user] && typeof(scammerList.data[user].date) === "string" && scammerList.data[user].date.startsWith("PERMA")) {
				Connection.send(`${WIFI_ROOM}|/rb ${user}, Permabanned scammer.`);
			}

			let now = new Date();

			if (now.getUTCDate > 26 && clonerList.data[user] && parseInt(clonerList.data[user].date)) {
				let date = new Date(parseInt(clonerList.data[user].date));
				if (date.getUTCMonth !== now.getUTCMonth) {
					if (user in notified && notified[user] > Date.now() - 4 * HOUR) return;

					Connection.send(`|/pm ${user}, Reminder: You have not done your cloner giveaway this month. If you fail to do this before the start of the new month, you will be purged from the list. NB: It's required to notify an editor of the cloner list that you've done your cloner GA.`);
					notified[user] = Date.now();
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
				return this.reply(clonerList.addUser(this.username, params));
			},
		},
		removecloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				return this.reply(clonerList.removeUser(this.username, toId(message)));
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
				if (!(this.canUse(5) || await settings.hexists('whitelist:cloners', this.userid) || this.userid === targetId)) return this.pmreply("Permission denied.");

				return this.reply(clonerList.updateUser(this.username, params));
			},
		},
		clonerga: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || await settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				let targetId = toId(message);
				if (!(targetId in clonerList.data)) return this.reply("User is not on the cloner list.");
				clonerList.data[targetId].date = Date.now();
				clonerList.writeList();

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} has approved ${targetId}'s cloner giveaway.`);

				return this.reply("Cloner list updated.");
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
				notified = {};
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

				settings.hset('whitelist:cloners', toId(message), message);
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

				settings.hdel('whitelist:cloners', toId(message));
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

		/*addtrainer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || await settings.hexists('whitelist:trainers', this.userid))) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				return this.reply(trainerList.addUser(this.username, params));
			},
		},
		removetrainer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || await settings.hexists('whitelist:trainers', this.userid))) return this.pmreply("Permission denied.");

				return this.reply(trainerList.removeUser(this.username, toId(message)));
			},
		},
		updatetrainer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				let targetId = toId(params[0]);

				if (!(targetId in trainerList.data)) return this.pmreply("User is not on the trainer list.");
				if (!(this.canUse(5) || await settings.hexists('whitelist:trainers', this.userid) || this.userid === targetId)) return this.pmreply("Permission denied.");

				return this.reply(trainerList.updateUser(this.username, params));
			},
		},
		traineractivity: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || await settings.hexists('whitelist:trainers', this.userid))) return this.pmreply("Permission denied.");

				let targetId = toId(message);
				if (!(targetId in trainerList.data)) return this.reply("User is not on the trainer list.");
				trainerList.data[targetId].date = Date.now();
				trainerList.writeList();

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} has approved ${targetId}'s EV training.`);

				return this.reply("trainer list updated.");
			},
		},
		purgetrainers: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let removed = trainerList.purgeList();
				// Do 10 names per time. Max length for a modnote is 300, assuming all names are the max length (19 characters), plus 2 for the ', ' sep. This would fit 14 names, but doing 10 since I need space for the rest of the message.
				for (let i = 0; i < removed.length; i += 10) {
					Connection.send(`${WIFI_ROOM}|/modnote ${removed.slice(i, i + 10)} ${i === removed.length - 1 ? 'was' : 'were'} removed from the trainer list`);
				}
				return this.reply(`${removed.length} user${(removed.length === 1 ? ' was' : 's were')} removed from the trainer list.`);
			},
		},
		settrainerflag: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let [user, flag] = message.split(',').map(param => param.trim());

				user = toId(user);
				if (!(user in trainerList.data)) return this.reply("User is not on the trainer list.");

				if (flag) {
					flag = flag.toUpperCase();

					trainerList.data[user].date = flag;

					trainerList.writeList();
					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s trainer flag was set to ${flag} by ${this.username}.`);
				} else {
					trainerList.data[user].date = Date.now();
					trainerList.writeList();

					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s trainer flag was removed by ${this.username}.`);
				}

				return this.reply("User's flag has been successfully updated.");
			},
		},
		whitelisttrainer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (await settings.hexists('whitelist:trainers', toId(message))) return this.reply("This user is already whitelisted.");

				settings.hset('whitelist:trainers', toId(message), message);
				Connection.send(`${WIFI_ROOM}|/modnote ${toId(message)} was whitelisted for the trainer list by ${this.username}.`);
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelisttrainer: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (!await settings.hexists('whitelist:trainers', toId(message))) return this.reply("This user isn't whitelisted.");

				settings.hdel('whitelist:trainers', toId(message));
				Connection.send(`${WIFI_ROOM}|/modnote ${toId(message)} was unwhitelisted for the trainer list by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		edittrainers: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let permission = this.canUse(5) || await settings.hexists('whitelist:trainers', this.userid);
				let editSelf = (this.userid in trainerList.data);
				if (!(permission || editSelf)) return this.pmreply("Permission denied.");

				if (Config.checkIps) {
					let [, ips] = await Handler.checkIp(this.userid);
					let data = {list: 'trainers'};
					if (permission) {
						data.permission = true;
					}
					data.user = this.userid;
					if (ips) data.ip = ips[0];
					let token = server.createAccessToken(data, 15);
					this.pmreply(`Edit link for the trainer list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/trainers?token=${token}`);
				} else {
					let data = {list: 'trainers'};
					if (permission) {
						data.permission = true;
					}
					data.user = this.userid;
					let token = server.createAccessToken(data, 15);
					this.pmreply(`Edit link for the trainer list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/trainers?token=${token}`);
				}
			},
		},*/

		addscammer: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				params.push(this.username);
				return this.reply(scammerList.addUser(this.username, params));
			},
		},
		removescammer: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				return this.reply(scammerList.removeUser(this.username, toId(message)));
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

				return this.reply(scammerList.updateUser(this.username, params));
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

				return this.reply(scammerList.updateUser(this.username, [targetId, 'alts:' + scammerList.data[targetId].alts + ', ' + params.slice(1).join(', ')]));
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
				/*for (let i in trainerList.data) {
					if (trainerList.data[i].fc === fc) return this.reply(`This FC belongs to ${trainerList.data[i].username}, who is an approved trainer.`);
				}*/

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
	},
};
