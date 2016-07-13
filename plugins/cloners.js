'use strict';

const fs = require('fs');

const server = require('../server.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;

const WIFI_ROOM = 'wifi';

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
			for (let i in Data[this.name]) {
				let values = [];
				for (let j in Data[this.name][i]) values.push(Data[this.name][i][j]);
				toWrite += values.join('\t') + '\n';
			}
			fs.writeFileSync(this.file, toWrite);
		};

		Databases.addDatabase(this.name, loadList, writeList);

		let generatePage = (req, res) => {
			let content = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" type="text/css" href="../style.css"><title>' + this.name + ' list - Kid A</title></head><body><div class="container"><table>';
			content += '<tr class="header"><th>' + this.columnNames.join('</th><th>') + '</th></tr>';
			for (let i in Data[this.name]) {
				content += '<tr>';
				for (let j in Data[this.name][i]) {
					if (j === 'date') {
						let date = new Date(parseInt(Data[this.name][i][j]));
						content += '<td>' + date.toDateString() + '</td>';
					} else {
						content += '<td>' + sanitize(Data[this.name][i][j]) + '</td>';
					}
				}
				content += '</tr>';
			}
			res.end(content + '</table></div></body></html>');
		};

		server.addRoute('/' + WIFI_ROOM + '/' + this.name, generatePage);

		if (!noOnlinePage) {
			let generateOnlinePage = (req, res) => {
				let content = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" type="text/css" href="../style.css"><title>Online ' + this.name + ' list - Kid A</title></head><body><div class="container"><h2>Online ' + this.name + ':</h2><ul>';
				for (let i in Data[this.name]) {
					if (Userlists[WIFI_ROOM] && Userlists[WIFI_ROOM].has(i)) content += '<li>' + sanitize(Data[this.name][i].username) + '</li>';
				}
				res.end(content + '</ul></div></body></html>');
			};

			server.addRoute('/' + WIFI_ROOM + '/o' + this.name, generateOnlinePage);
		}
	}

	addUser(user, params) {
		if (params.length !== this.columnKeys.length - (this.noTime ? 0 : 1)) return {reply: "Invalid amount of arguments"};
		if (toId(params[0]) in Data[this.name]) return {reply: "'" + params[0] + "' is already a " + this.name.slice(0, -1) + "."};

		let userid = toId(params[0]);
		Data[this.name][userid] = {};
		if (!this.noTime) {
			params.push(Date.now());
		}
		for (let i = 0; i < this.columnKeys.length; i++) {
			Data[this.name][userid][this.columnKeys[i]] = params[i];
		}
		fs.appendFileSync(this.file, params.join('\t') + '\n');

		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' added ' + toId(params[0]) + ' to the ' + this.name.slice(0, -1) + ' list.');

		return {reply: "'" + params[0] + "' was successfully added to the " + this.name.slice(0, -1) + " list."};
	}

	removeUser(user, target) {
		if (!(target in Data[this.name])) return {reply: "User is not on the " + this.name.slice(0, -1) + " list."};
		delete Data[this.name][target];
		Databases.writeDatabase(this.name);
		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' deleted ' + target + ' from the ' + this.name.slice(0, -1) + ' list.');
		return {reply: "User successfully removed."};
	}

	updateUser(user, params) {
		let userid = toId(user);
		for (let i = 1; i < params.length; i++) {
			let param = params[i].split(':').map(param => param.trim());
			if (param.length !== 2) return {reply: "Syntax error in " + params[i]};
			param[0] = toId(param[0]);
			if (param[0] === 'username' || param[0] === 'date') return {reply: "This column can't be changed."};
			if (!(param[0] in this.columnKeys)) return {reply: "Invalid key: " + param[0]};
			Data[this.name][userid][param[0]] = param[1];
		}

		Databases.writeDatabase(this.name);
		Connection.send(WIFI_ROOM + '|/modnote ' + user + ' updated ' + (toId(user) === toId(params[0]) ? 'their' : toId(params[0]) + "'s'") + ' ' + this.name.slice(0, -1) + ' info.');
		return {reply: "User successfully updated."};
	}

	purgeList() {
		let removed = [];
		let now = Date.now();
		for (let i in Data[this.name]) {
			if (now - Data[this.name][i].lastdate > MONTH) removed.push(i);
		}
		removed.forEach(userid => delete Data[this.name][userid]);
		Databases.writeDatabase(this.name);
		return {reply: "/modnote The following users were purged from the " + this.name.slice(0, -1) + " list: " + removed.join(', ')};
	}
}

const clonerList = new WifiList('cloners', './data/cloners.tsv', ['PS Username', 'Friend code', 'IGN', 'Notes', 'Date of last giveaway'], ['username', 'fc', 'ign', 'notes']);
const trainerList = new WifiList('trainers', './data/trainers.tsv', ['PS Username', 'Friend code', 'IGN', 'EV Spread Type', 'Level Training', 'Collateral', 'Notes', 'Date of last EV training'], ['username', 'fc', 'ign', 'evs', 'levels', 'collateral', 'notes']);
const scammerList = new WifiList('scammers', './data/scammers.tsv', ['PS Username', 'Alts', 'Friend code', 'IGN', 'Evidence', 'Reason', 'Added by'], ['username', 'alts', 'fc', 'ign', 'evidence', 'reason', 'addedby'], true, true);

module.exports = {
	commands: {
		addcloner(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			return clonerList.addUser(userstr.substr(1), params);
		},
		removecloner(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			return clonerList.removeUser(userstr.substr(1), toId(message));
		},
		updatecloner(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			let userid = toId(params[0]);

			if (!(userid in Data.cloners)) return {pmreply: "User is not on the cloner list."};
			if (!(canUse(userstr, 4) || toId(userstr) === toId(params[0]))) return {pmreply: "Permission denied."};

			return clonerList.updateUser(userstr.substr(1), params);
		},
		clonerga(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let userid = toId(message);
			if (!(userid in Data.cloners)) return {reply: "User is not on the cloner list."};
			Data.cloners[userid].lastdate = Date.now();
			Databases.writeDatabase('cloners');

			Connection.send(WIFI_ROOM + '|/modnote ' + userstr.substr(1) + ' has approved ' + userid + "'s cloner giveaway.");

			return {reply: "Cloner list updated."};
		},
		purgecloners(userstr, room) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 5)) return {pmreply: "Permission denied."};

			return clonerList.purgeList();
		},

		addtrainer(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			return trainerList.addUser(userstr.substr(1), params);
		},
		removetrainer(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			return trainerList.removeUser(userstr.substr(1), toId(message));
		},
		updatetrainer(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			let userid = toId(params[0]);

			if (!(userid in Data.trainers)) return {pmreply: "User is not on the trainer list."};
			if (!(canUse(userstr, 4) || toId(userstr) === toId(params[0]))) return {pmreply: "Permission denied."};

			return trainerList.updateUser(userstr.substr(1), params);
		},
		traineractivity(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let userid = toId(message);
			if (!(userid in Data.trainers)) return {reply: "User is not on the trainer list."};
			Data.trainers[userid].lastdate = Date.now();
			Databases.writeDatabase('trainers');

			Connection.send(WIFI_ROOM + '|/modnote ' + userstr.substr(1) + ' has approved ' + userid + "'s EV training.");

			return {reply: "Trainer list updated."};
		},
		purgetrainers(userstr, room) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 5)) return {pmreply: "Permission denied."};

			return trainerList.purgeList();
		},

		addscammer(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			params.push(userstr.substr(1));
			return scammerList.addUser(userstr.substr(1), params);
		},
		removescammer(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			return scammerList.removeUser(userstr.substr(1), toId(message));
		},
		updatescammer(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			let userid = toId(params[0]);

			if (!(userid in Data.scammers)) return {pmreply: "User is not on the scammer list."};

			return scammerList.updateUser(userstr.substr(1), params);
		},
		addscammeralt(userstr, room, message) {
			if (room !== WIFI_ROOM) return {pmreply: "This command can only be used in the Wi-Fi room."};
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let params = message.split(',').map(param => param.trim());
			let userid = toId(params[0]);

			if (!(userid in Data.scammers)) return {pmreply: "User is not on the scammer list."};

			return scammerList.updateUser(userstr.substr(1), [userid, 'alts:' + Data.scammers[userid].alts + ', ' + params.slice(1).join(', ')]);
		},
		checkfc(userstr, room, message) {
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};
			let id = toId(message);
			if (!(id.length === 12 && parseInt(id))) return {reply: "Invalid input."};

			let fc = id.substr(0, 4) + '-' + id.substr(4, 4) + '-' + id.substr(8, 4);

			for (let i in Data.scammers) {
				if (Data.scammers[i].fc === fc) return {reply: "This IP belongs to " + Data.scammers[i].username + ", who was put on the list for '" + Data.scammers[i].reason + "'."};
			}

			return {reply: "This FC was not found on the scammers list."};
		},
	},
};
