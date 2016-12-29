'use strict';

const fs = require('fs');

const server = require('../server.js');
const databases = require('../databases.js');
const utils = require('../utils.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;
const WEEK = 7 * 24 * 60 * 60 * 1000;

const FC_REGEX = /[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}/;

const WIFI_ROOM = 'wifi';

const settings = databases.getDatabase('settings');
if (!settings.whitelists) settings.whitelists = {};
if (!settings.whitelists.cloners) settings.whitelists.cloners = [];
if (!settings.whitelists.trainers) settings.whitelists.trainers = [];
databases.writeDatabase('settings');

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

		let loadList = () => {
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
		};

		let writeList = () => {
			let toWrite = this.columnNames.join('\t') + "\n";
			for (let i in this.data) {
				let values = [];
				for (let j in this.data[i]) values.push(this.data[i][j]);
				toWrite += values.join('\t') + '\n';
			}
			fs.writeFileSync(this.file, toWrite);
		};

		databases.addDatabase(this.name, loadList, writeList);
		this.data = databases.getDatabase(this.name);

		let changeList = (tokenData, edits) => {
			if (tokenData.list !== this.name || !(tokenData.permission || tokenData.user)) return;

			if (!tokenData.permission && (Object.keys(edits).length && !(tokenData.user in edits))) return;

			for (let i in edits) {
				if (!this.data[i]) return;
				for (let key in edits[i]) {
					if (key === 'username'|| (key === 'date' && !tokenData.permission)) continue;

					let elem = edits[i][key];
					if (key === 'fc') {
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

			databases.writeDatabase(this.name);
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

		let generatePage = (req, res) => {
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

			if (settings.whitelists[this.name]) {
				data.editors = settings.whitelists[this.name].join(', ');
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
				if (!FC_REGEX.test(params[i])) return "Invalid formatting for Friend Code. format: ``1111-2222-3333``";
				params[i] = toId(params[i]);
				params[i] = params[i].substr(0, 4) + '-' + params[i].substr(4, 4) + '-' + params[i].substr(8, 4);
				if (!utils.validateFc(params[i])) return "The Friend code you entered is invalid";
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
		databases.writeDatabase(this.name);
		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' deleted ' + target + ' from the ' + this.name.slice(0, -1) + ' list.');
		return "User successfully removed.";
	}

	updateUser(user, params) {
		let userid = toId(params[0]);
		for (let i = 1; i < params.length; i++) {
			let param = params[i].split(':').map(param => param.trim());
			if (param.length !== 2) return "Syntax error in " + params[i];
			param[0] = toId(param[0]);
			if (param[0] === 'username' || param[0] === 'date') return "This column can't be changed.";
			if (this.columnKeys.indexOf(param[0]) < 0) return "Invalid key: " + param[0];
			this.data[userid][param[0]] = param[1];
		}

		databases.writeDatabase(this.name);
		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' updated ' + (toId(user) === userid ? 'their' : userid + "'s'") + ' ' + this.name.slice(0, -1) + ' info.');
		return "User successfully updated.";
	}

	purgeList() {
		let removed = [];
		let now = Date.now();
		for (let i in this.data) {
			if (parseInt(this.data[i].date)) {
				if (now - this.data[i].date > MONTH) removed.push(i);
			}
		}
		removed.forEach(userid => delete this.data[userid]);
		databases.writeDatabase(this.name);
		return "The following users were purged from the " + this.name.slice(0, -1) + " list: " + removed.join(', ');
	}
}

const clonerList = new WifiList('cloners', './data/cloners.tsv', ['PS Username', 'Friend code', 'IGN', 'Notes', 'Date of last giveaway'], ['username', 'fc', 'ign', 'notes']);
const trainerList = new WifiList('trainers', './data/trainers.tsv', ['PS Username', 'IGN', 'Friend code', 'EV Spread Type', 'Collateral', 'Notes', 'Date of last activity check'], ['username', 'ign', 'fc', 'evs', 'collateral', 'notes']);
const scammerList = new WifiList('scammers', './data/scammers.tsv', ['PS Username', 'Alts', 'IGN', 'Friend code', 'Evidence', 'Reason', 'Added by', 'Date added'], ['username', 'alts', 'ign', 'fc', 'evidence', 'reason', 'addedby'], true);

let notified = new Set();

module.exports = {
	onUserJoin: {
		rooms: [WIFI_ROOM],
		action(user) {
			user = toId(user);

			// Autoban permabanned scammers
			if (scammerList.data[user] && typeof(scammerList.data[user].date) === "string" && scammerList.data[user].date.startsWith("PERMA")) {
				Connection.send(`${WIFI_ROOM}|/rb ${user}`);
			}

			let now = Date.now();

			if (clonerList.data[user] && typeof(clonerList.data[user].date) === "number" && now - clonerList.data[user].date > 4 * WEEK && !notified.has(user)) {
				Connection.send(`|/pm ${user}, Reminder: You have not done your cloner giveaway in the past month. If you fail to do this before the start of the new month, you will be purged from the list. NB: It's required to notify an editor of the cloner list that you've done your cloner GA.`);
				notified.add(user);
			}
		},
	},
	commands: {
		addcloner: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || this.settings.whitelists.cloners.indexOf(this.userid) > -1)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				return this.reply(clonerList.addUser(this.username, params));
			},
		},
		removecloner: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || this.settings.whitelists.cloners.indexOf(this.userid) > -1)) return this.pmreply("Permission denied.");

				return this.reply(clonerList.removeUser(this.username, toId(message)));
			},
		},
		updatecloner: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				let targetId = toId(params[0]);

				if (!(targetId in clonerList.data)) return this.pmreply("User is not on the cloner list.");
				if (!(this.canUse(5) || this.settings.whitelists.cloners.indexOf(this.userid) > -1 || this.userid === targetId)) return this.pmreply("Permission denied.");

				return this.reply(clonerList.updateUser(this.username, params));
			},
		},
		clonerga: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || this.settings.whitelists.cloners.indexOf(this.userid) > -1)) return this.pmreply("Permission denied.");

				let targetId = toId(message);
				if (!(targetId in clonerList.data)) return this.reply("User is not on the cloner list.");
				clonerList.data[targetId].date = Date.now();
				databases.writeDatabase('cloners');

				Connection.send(WIFI_ROOM + '|/modnote ' + this.username + ' has approved ' + targetId + "'s cloner giveaway.");

				return this.reply("Cloner list updated.");
			},
		},
		purgecloners: {
			rooms: [WIFI_ROOM],
			action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let msg = clonerList.purgeList();
				Connection.send(WIFI_ROOM + '|/modnote ' + msg);
				return this.reply(msg);
			},
		},
		whitelistcloner: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (this.settings.whitelists.cloners.indexOf(toId(message)) > -1) return this.reply("This user is already whitelisted.");

				this.settings.whitelists.cloners.push(toId(message));
				databases.writeDatabase('settings');
				Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was whitelisted for the cloner list by ' + this.username + '.');
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelistcloner: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let i = this.settings.whitelists.cloners.indexOf(toId(message));

				if (i < 0) return this.reply("This user isn't whitelisted.");

				this.settings.whitelists.cloners.splice(i, 1);
				databases.writeDatabase('settings');
				Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was unwhitelisted for the cloner list by ' + this.username + '.');
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		setclonerflag: {
			rooms: [WIFI_ROOM],
			action(message) {
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

					databases.writeDatabase('cloners');
					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s cloner flag was set to ${flag} by ${this.username}.`);
				} else {
					clonerList.data[user].date = Date.now();
					databases.writeDatabase('cloners');

					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s cloner flag was removed by ${this.username}.`);
				}

				return this.reply("User's flag has been successfully updated.");
			},
		},
		editcloners: {
			rooms: [WIFI_ROOM],
			action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let permission = this.canUse(5) || this.settings.whitelists.cloners.includes(this.userid);
				let editSelf = (this.userid in clonerList.data);
				if (!(permission || editSelf)) return this.pmreply("Permission denied.");

				if (Config.checkIps) {
					Handler.checkIp(this.userid, (userid, ips) => {
						let data = {list: 'cloners'};
						if (permission) {
							data.permission = true;
						}
						data.user = this.userid;
						if (ips) data.ip = ips[0];
						let token = server.createAccessToken(data, 15);
						return this.pmreply(`Edit link for the cloner list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/cloners?token=${token}`);
					});
				} else {
					let data = {list: 'cloners'};
					if (permission) {
						data.permission = true;
					}
					data.user = this.userid;
					let token = server.createAccessToken(data, 15);
					return this.pmreply(`Edit link for the cloner list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/cloners?token=${token}`);
				}
			},
		},

		addtrainer: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || this.settings.whitelists.trainers.indexOf(this.userid) > -1)) return this.pmreply("Permission denied.");

				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				return this.reply(trainerList.addUser(this.username, params));
			},
		},
		removetrainer: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || this.settings.whitelists.trainers.indexOf(this.userid) > -1)) return this.pmreply("Permission denied.");

				return this.reply(trainerList.removeUser(this.username, toId(message)));
			},
		},
		updatetrainer: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
				let targetId = toId(params[0]);

				if (!(targetId in trainerList.data)) return this.pmreply("User is not on the trainer list.");
				if (!(this.canUse(5) || this.settings.whitelists.trainers.indexOf(this.userid) > -1 || this.userid === targetId)) return this.pmreply("Permission denied.");

				return this.reply(trainerList.updateUser(this.username, params));
			},
		},
		traineractivity: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(3) || this.settings.whitelists.trainers.indexOf(this.userid) > -1)) return this.pmreply("Permission denied.");

				let targetId = toId(message);
				if (!(targetId in trainerList.data)) return this.reply("User is not on the trainer list.");
				trainerList.data[targetId].date = Date.now();
				databases.writeDatabase('trainers');

				Connection.send(WIFI_ROOM + '|/modnote ' + this.username + ' has approved ' + targetId + "'s EV training.");

				return this.reply("Trainer list updated.");
			},
		},
		purgetrainers: {
			rooms: [WIFI_ROOM],
			action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let msg = trainerList.purgeList();
				Connection.send(WIFI_ROOM + '|/modnote ' + msg);
				return this.reply(msg);
			},
		},
		whitelisttrainer: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (this.settings.whitelists.trainers.indexOf(toId(message)) > -1) return this.reply("This user is already whitelisted.");

				this.settings.whitelists.trainers.push(toId(message));
				databases.writeDatabase('settings');
				Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was whitelisted for the trainer list by ' + this.username + '.');
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelisttrainer: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let i = this.settings.whitelists.trainers.indexOf(toId(message));

				if (i < 0) return this.reply("This user isn't whitelisted.");

				this.settings.whitelists.trainers.splice(i, 1);
				databases.writeDatabase('settings');
				Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was unwhitelisted for the trainer list by ' + this.username + '.');
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		settrainerflag: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				let [user, flag] = message.split(',').map(param => param.trim());

				user = toId(user);
				if (!(user in trainerList.data)) return this.reply("User is not on the cloner list.");

				if (flag) {
					flag = flag.toUpperCase();

					trainerList.data[user].date = flag;

					databases.writeDatabase('trainers');
					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s trainer flag was set to ${flag} by ${this.username}.`);
				} else {
					trainerList.data[user].date = Date.now();
					databases.writeDatabase('trainers');

					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s trainer flag was removed by ${this.username}.`);
				}

				return this.reply("User's flag has been successfully updated.");
			},
		},
		edittrainers: {
			rooms: [WIFI_ROOM],
			action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				let permission = this.canUse(5) || this.settings.whitelists.trainers.includes(this.userid);
				let editSelf = (this.userid in trainerList.data);
				if (!(permission || editSelf)) return this.pmreply("Permission denied.");

				if (Config.checkIps) {
					Handler.checkIp(this.userid, (userid, ips) => {
						let data = {list: 'trainers'};
						if (permission) {
							data.permission = true;
						}
						data.user = this.userid;
						if (ips) data.ip = ips[0];
						let token = server.createAccessToken(data, 15);
						return this.pmreply(`Edit link for the trainer list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/trainers?token=${token}`);
					});
				} else {
					let data = {list: 'trainers'};
					if (permission) {
						data.permission = true;
					}
					data.user = this.userid;
					let token = server.createAccessToken(data, 15);
					return this.pmreply(`Edit link for the trainer list **DON'T SHARE THIS LINK**: ${server.url}${WIFI_ROOM}/trainers?token=${token}`);
				}
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
			action(message) {
				let id = toId(message);
				if (!(id.length === 12 && parseInt(id))) return this.reply("Invalid input.");

				let fc = id.substr(0, 4) + '-' + id.substr(4, 4) + '-' + id.substr(8, 4);

				if (!utils.validateFc(fc)) return this.reply("This FC is invalid.");

				for (let i in scammerList.data) {
					if (scammerList.data[i].fc === fc) return this.reply("This IP belongs to " + scammerList.data[i].username + ", who was put on the list for '" + scammerList.data[i].reason + "'.");
				}

				return this.reply("This FC was not found on the scammers list.");
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
				if (!(user in scammerList.data)) return this.reply("User is not on the cloner list.");

				if (flag) {
					flag = flag.toUpperCase();

					scammerList.data[user].date = flag;

					databases.writeDatabase('scammers');
					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s scammer flag was set to ${flag} by ${this.username}.`);
				} else {
					scammerList.data[user].date = Date.now();
					databases.writeDatabase('scammers');

					Connection.send(`${WIFI_ROOM}|/modnote ${user}'s scammer flag was removed by ${this.username}.`);
				}

				return this.reply("User's flag has been successfully updated.");
			},
		},
	},
};
