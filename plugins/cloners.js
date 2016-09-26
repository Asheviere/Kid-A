'use strict';

const fs = require('fs');

const server = require('../server.js');
const databases = require('../databases.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;

const WIFI_ROOM = 'wifi';

const settings = databases.getDatabase('settings');
if (!settings.whitelists) settings.whitelists = {};
if (!settings.whitelists.cloners) settings.whitelists.cloners = [];
if (!settings.whitelists.trainers) settings.whitelists.trainers = [];
databases.writeDatabase('settings');

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

		let generatePage = (req, res) => {
			let content = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" type="text/css" href="../style.css"><title>' + this.name + ' list - Kid A</title></head><body><div class="container">';
			if (settings.whitelists[this.name]) {
				content += '<p class="note">Editors: ' + settings.whitelists[this.name].join(', ') + '</p>';
			}
			content += '<table><tr class="header"><th>' + this.columnNames.join('</th><th>') + '</th></tr>';
			let keys = Object.keys(this.data).sort((a, b) => {
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
			});
			for (let iter = 0; iter < keys.length; iter++) {
				let i = keys[iter];
				content += '<tr>';
				for (let j in this.data[i]) {
					if (j === 'date' && parseInt(this.data[i][j])) {
						let date = new Date(parseInt(this.data[i][j]));
						content += '<td>' + date.toDateString() + '</td>';
					} else {
						content += '<td>' + sanitize(this.data[i][j]) + '</td>';
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
				for (let i in this.data) {
					if (Handler.userlists[WIFI_ROOM] && (i in Handler.userlists[WIFI_ROOM])) content += '<li>' + sanitize(this.data[i].username) + '</li>';
				}
				res.end(content + '</ul></div></body></html>');
			};

			server.addRoute('/' + WIFI_ROOM + '/o' + this.name, generateOnlinePage);
		}
	}

	addUser(user, params) {
		if (params.length !== this.columnKeys.length - (this.noTime ? 0 : 1)) return "Invalid amount of arguments";
		if (toId(params[0]) in this.data) return "'" + params[0] + "' is already a " + this.name.slice(0, -1) + ".";

		let userid = toId(params[0]);
		this.data[userid] = {};
		if (!this.noTime) {
			params.push(Date.now());
		}
		for (let i = 0; i < this.columnKeys.length; i++) {
			this.data[userid][this.columnKeys[i]] = params[i];
		}
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
			if (param[0] === 'username') return "This column can't be changed.";
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
		return this.reply("/modnote The following users were purged from the " + this.name.slice(0, -1) + " list: " + removed.join(', '));
	}
}

const clonerList = new WifiList('cloners', './data/cloners.tsv', ['PS Username', 'Friend code', 'IGN', 'Notes', 'Date of last giveaway'], ['username', 'fc', 'ign', 'notes']);
const trainerList = new WifiList('trainers', './data/trainers.tsv', ['PS Username', 'IGN', 'Friend code', 'EV Spread Type', 'Level Training', 'Collateral', 'Notes', 'Date of last EV training'], ['username', 'ign', 'fc', 'evs', 'levels', 'collateral', 'notes']);
const scammerList = new WifiList('scammers', './data/scammers.tsv', ['PS Username', 'Alts', 'IGN', 'Friend code', 'Evidence', 'Reason', 'Added by', 'Date added'], ['username', 'alts', 'ign', 'fc', 'evidence', 'reason', 'addedby'], true);

module.exports = {
	commands: {
		addcloner(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!(canUse(userstr, 5) || this.settings.whitelists.cloners.indexOf(userid) > -1)) return this.pmreply("Permission denied.");

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			return this.reply(clonerList.addUser(userstr.substr(1), params));
		},
		removecloner(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!(canUse(userstr, 5) || this.settings.whitelists.cloners.indexOf(userid) > -1)) return this.pmreply("Permission denied.");

			return this.reply(clonerList.removeUser(userstr.substr(1), toId(message)));
		},
		updatecloner(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			let targetId = toId(params[0]);

			if (!(targetId in clonerList.data)) return this.pmreply("User is not on the cloner list.");
			if (!(canUse(userstr, 5) || this.settings.whitelists.cloners.indexOf(userid) > -1 || userid === targetId)) return this.pmreply("Permission denied.");

			return this.reply(clonerList.updateUser(userstr.substr(1), params));
		},
		clonerga(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!(canUse(userstr, 5) || this.settings.whitelists.cloners.indexOf(userid) > -1)) return this.pmreply("Permission denied.");

			let targetId = toId(message);
			if (!(targetId in clonerList.data)) return this.reply("User is not on the cloner list.");
			clonerList.data[targetId].date = Date.now();
			databases.writeDatabase('cloners');

			Connection.send(WIFI_ROOM + '|/modnote ' + userstr.substr(1) + ' has approved ' + targetId + "'s cloner giveaway.");

			return this.reply("Cloner list updated.");
		},
		purgecloners(userstr, room) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 5)) return this.pmreply("Permission denied.");

			return this.reply(clonerList.purgeList());
		},
		whitelistcloner(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 5)) return this.pmreply("Permission denied.");

			if (this.settings.whitelists.cloners.indexOf(toId(message)) > -1) return this.reply("This user is already whitelisted.");

			this.settings.whitelists.cloners.push(toId(message));
			databases.writeDatabase('settings');
			Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was whitelisted for the cloner list by ' + userstr.substr(1) + '.');
			return this.reply("User successfully whitelisted.");
		},
		unwhitelistcloner(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 5)) return this.pmreply("Permission denied.");

			let i = this.settings.whitelists.cloners.indexOf(toId(message));

			if (i < 0) return this.reply("This user isn't whitelisted.");

			this.settings.whitelists.cloners.splice(i, 1);
			databases.writeDatabase('settings');
			Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was unwhitelisted for the cloner list by ' + userstr.substr(1) + '.');
			return this.reply("User successfully removed from the whitelist.");
		},

		addtrainer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!(canUse(userstr, 5) || this.settings.whitelists.trainers.indexOf(userid) > -1)) return this.pmreply("Permission denied.");

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			return this.reply(trainerList.addUser(userstr.substr(1), params));
		},
		removetrainer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!(canUse(userstr, 5) || this.settings.whitelists.trainers.indexOf(userid) > -1)) return this.pmreply("Permission denied.");

			return this.reply(trainerList.removeUser(userstr.substr(1), toId(message)));
		},
		updatetrainer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			let targetId = toId(params[0]);

			if (!(targetId in trainerList.data)) return this.pmreply("User is not on the trainer list.");
			if (!(canUse(userstr, 5) || this.settings.whitelists.trainers.indexOf(userid) > -1 || userid === targetId)) return this.pmreply("Permission denied.");

			return this.reply(trainerList.updateUser(userstr.substr(1), params));
		},
		traineractivity(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!(canUse(userstr, 5) || this.settings.whitelists.trainers.indexOf(userid) > -1)) return this.pmreply("Permission denied.");

			let targetId = toId(message);
			if (!(targetId in trainerList.data)) return this.reply("User is not on the trainer list.");
			trainerList.data[targetId].date = Date.now();
			databases.writeDatabase('trainers');

			Connection.send(WIFI_ROOM + '|/modnote ' + userstr.substr(1) + ' has approved ' + targetId + "'s EV training.");

			return this.reply("Trainer list updated.");
		},
		purgetrainers(userstr, room) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 5)) return this.pmreply("Permission denied.");

			return this.reply(trainerList.purgeList());
		},
		whitelisttrainer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 5)) return this.pmreply("Permission denied.");

			if (this.settings.whitelists.trainers.indexOf(toId(message)) > -1) return this.reply("This user is already whitelisted.");

			this.settings.whitelists.trainers.push(toId(message));
			databases.writeDatabase('settings');
			Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was whitelisted for the trainer list by ' + userstr.substr(1) + '.');
			return this.reply("User successfully whitelisted.");
		},
		unwhitelisttrainer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 5)) return this.pmreply("Permission denied.");

			let i = this.settings.whitelists.trainers.indexOf(toId(message));

			if (i < 0) return this.reply("This user isn't whitelisted.");

			this.settings.whitelists.trainers.splice(i, 1);
			databases.writeDatabase('settings');
			Connection.send(WIFI_ROOM + '|/modnote ' + toId(message) + ' was unwhitelisted for the trainer list by ' + userstr.substr(1) + '.');
			return this.reply("User successfully removed from the whitelist.");
		},

		addscammer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 3)) return this.pmreply("Permission denied.");

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());
			params.push(userstr.substr(1));
			return this.reply(scammerList.addUser(userstr.substr(1), params));
		},
		removescammer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 3)) return this.pmreply("Permission denied.");

			return this.reply(scammerList.removeUser(userstr.substr(1), toId(message)));
		},
		updatescammer(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 3)) return this.pmreply("Permission denied.");

			let params = message.split((message.includes('|') ? '|' : ',')).map(param => param.trim());

			if (!(toId(params[0]) in scammerList.data)) return this.pmreply("User is not on the scammer list.");

			return this.reply(scammerList.updateUser(userstr.substr(1), params));
		},
		addscammeralt(userstr, room, message) {
			let userid = toId(userstr);
			if (!room) {
				 if (this.userlists[WIFI_ROOM]) {
					if (userid in this.userlists[WIFI_ROOM]) {
						userstr = this.userlists[WIFI_ROOM][userid].join('');
					} else {
						return this.reply("You need to be in the Wi-Fi room to use this command.");
					}
				 } else {
					 errorMsg("Someone tried to use a wifi room command without the bot being in the wifi room. Either make the bot join wifi, or remove cloners.js");
					 return this.reply("Something went wrong! The bot's owner has been notified.");
				 }
			} else if (room !== WIFI_ROOM) {
				return this.pmreply("This command can only be used in the Wi-Fi room.");
			}
			if (!canUse(userstr, 3)) return this.pmreply("Permission denied.");

			let params = message.split(',').map(param => param.trim());
			let targetId = toId(params[0]);

			if (!(targetId in scammerList.data)) return this.pmreply("User is not on the scammer list.");

			return this.reply(scammerList.updateUser(userstr.substr(1), [targetId, 'alts:' + scammerList.data[targetId].alts + ', ' + params.slice(1).join(', ')]));
		},
		checkfc(userstr, room, message) {
			if (!canUse(userstr, 1)) return this.pmreply("Permission denied.");
			let id = toId(message);
			if (!(id.length === 12 && parseInt(id))) return this.reply("Invalid input.");

			let fc = id.substr(0, 4) + '-' + id.substr(4, 4) + '-' + id.substr(8, 4);

			for (let i in scammerList.data) {
				if (scammerList.data[i].fc === fc) return this.reply("This IP belongs to " + scammerList.data[i].username + ", who was put on the list for '" + scammerList.data[i].reason + "'.");
			}

			return this.reply("This FC was not found on the scammers list.");
		},
	},
};
