var request = require('request');
var fs = require('fs');
var cheerio = require('cheerio');

var actionUrl = 'http://play.pokemonshowdown.com/action.php';

function loadSettings() {
	var data;
	try {
		data = require('./data/settings.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeSettings() {
	var toWrite = JSON.stringify(Data.settings);

	fs.writeFileSync('./data/settings.json', toWrite);
}

function loadData() {
	var data;
	try {
		data = require('./data/data.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeData() {
	var toWrite = JSON.stringify(Data.data);

	fs.writeFileSync('./data/data.json', toWrite);
}

Databases.addDatabase('settings', loadSettings, writeSettings);
global.Settings = Data.settings;
Databases.addDatabase('data', loadData, writeData);

// Load the analyzers and plugins.
var plugins = {};
var files = fs.readdirSync('./plugins');

for (var j = 0; j < files.length; j++) {
	if (Config.blacklistedPlugins.indexOf(files[j].split('.')[0]) > -1) continue;
	plugins[files[j].split('.')[0]] = require('./plugins/' + files[j]);
}

var analyzers = {};
global.Commands = {};

for (var i in plugins) {
	if (plugins[i].analyzer) {
		analyzers[i] = plugins[i].analyzer;
	}
	if (plugins[i].commands) {
		for (var command in plugins[i].commands) {
			Commands[command] = plugins[i].commands[command];
		}
	}
}

function dataResolver(req, res) {
	var room = req.originalUrl.split('/')[1];
	var content = '<!DOCTYPE html><html><head><link rel="stylesheet" type="text/css" href="../style.css"><title>' + room + ' - Kid A</title></head><body><div class="container">';
	content += "<h1>" + room + ' data:</h1><div class="quotes">';
	for (var i in analyzers) {
		content += '<div class="analyzer">';
		if (analyzers[i].display && (!analyzers[i].rooms || analyzers[i].rooms.indexOf(room) > -1)) {
			content += analyzers[i].display(room);
		}
		content += '</div>';
	}
	content += '</div></body></html>';
	res.end(content);
}

for (var room in Data.data) {
	Server.addPage('/' + room + '/data', dataResolver);
}

Server.start();

module.exports = {
	analyzers: analyzers,
	ipQueue: [],

	checkIp: function(userid, resolver) {
		Connection.send('|/ip ' + userid);
		this.ipQueue.push({query: userid, resolver: resolver});
	},

	setup: function() {
		Connection.send('|/avatar ' + Config.avatar);

		this.toJoin = Config.rooms;

		if (Settings.toJoin) {
			this.toJoin = this.toJoin.concat(Settings.toJoin);
		}

		Connection.send('|/autojoin ' + this.toJoin.splice(0, 11).join(','));

		statusMsg('Setup done.');
	},

	parseCommand: function(userstr, room, message) {
		var username = userstr.substr(1);

		var words = message.split(' ');
		var cmd = words.splice(0, 1)[0].substr(1);
		if (!(cmd in Commands)) {
			if (room) return;
			return this.sendPM(user, 'Invalid command.');
		}

		var user = (!room && userstr[0] === ' ' ? '+' : userstr[0]) + username;
		if (Settings[room] && Settings[room][cmd] === 'off') return;
		var action = Commands[cmd](user, room, words.join(' '));
		if (!action) return;

		if (action.then) {
			action.then(val => this.parseAction(username, room, val));
		} else {
			this.parseAction(username, room, action);
		}
	},

	parseAction: function(user, room, action) {
		if (!action) return;
		if (action.pmreply) {
			this.sendPM(user, action.pmreply);
		}
		if (action.reply) {
			if (room) {
				Connection.send(room + '|' + action.reply.replace(/trigger/g, 't⁠igger'));
			} else {
				this.sendPM(user, action.reply);
			}
		}
	},

	parseIP: function(html) {
		var userid = toId(html('.username').text());
		var split = html.root().html().split('>');
		var ips, previousNames;
		for (var i = 0; i < split.length; i++) {
			if (split[i].trim().startsWith('IP:')) {
				ips = split[i].trim().substr(4).split('<')[0].split(', ');
				break;
			}
			if (split[i].trim().startsWith('Previous names:')) {
				previousNames = split[i].trim().substr(4).split('<')[0].split(', ');
				break;
			}
		}
		var idx = this.ipQueue.findIndex(elem => elem.query === userid);
		if (idx < 0 && previousNames) idx = this.ipQueue.findIndex(elem => previousNames.indexOf(elem.query) > -1);
		if (idx < 0) return;
		if (this.ipQueue[idx].resolver) return this.ipQueue.splice(idx, 1)[0].resolver(userid, ips);
	},

	parse: function(message) {
		if (!message) return;
		var split = message.split('|');
		if (!split[0]) split[0] = '>lobby'; // Zarel can't code

		switch (split[1]) {
		case 'challstr':
			statusMsg('Received challstr, logging in...');

			var challstr = split.slice(2).join('|');

			request.post(actionUrl, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: 'act=login&name=' + Config.username + '&pass=' + Config.password + '&challstr=' + challstr
			}, (error, response, body) => {
				if (!error && response.statusCode == 200) {
					if (body[0] === ']') {
						try {
							body = JSON.parse(body.substr(1));
						} catch (e) {}
						if (body.assertion && body.assertion[0] !== ';') {
							this.setup();
							Connection.send('|/trn ' + Config.username + ',0,' + body.assertion);
						} else {
							forceQuit('Couldn\'t log in.');
						}
					} else {
						forceQuit('Incorrect request.');
					}
				}
			});
			break;
		case 'updateuser':
			if (split[2] !== Config.username) return false;

			statusMsg('Logged in as ' + split[2] + '.');

			if (this.toJoin.length) {
				statusMsg('Joining additional rooms.');

				var joiner = function(toJoin) {
					var room = toJoin.splice(0, 1);
					if (room.length) {
						Connection.send('|/join ' + room[0]);
						setTimeout(() => {
							joiner(toJoin);
						}, 500);
					}
				};

				joiner(this.toJoin);
			}
			break;
		case 'pm':
			if (toId(split[2]) === toId(Config.username)) return false;

			split[4] = split.splice(4).join('|');
			if (split[4].startsWith(Config.commandSymbol)) {
				this.parseCommand(split[2], null, split[4]);
			} else {
				if (canUse(split[2], 2) && split[4].startsWith('/invite')) {
					var room = split[4].substr(8);
					if (!(Config.rooms.indexOf(room) > -1 || (Settings.toJoin && Settings.toJoin.indexOf(room) > -1))) {
						if (!Settings.toJoin) Settings.toJoin = [];
						Settings.toJoin.push(room);
						Connection.send('|/join ' + room);
						return Databases.writeDatabase('settings');
					}
				}
				pmMsg('PM from ' + (split[2][0] === ' ' ? split[2].substr(1) : split[2]) + ': ' + split[4]);
				Connection.send("|/reply Hi I'm a chatbot made by bumbadadabum. I moderate rooms, provide chat analytics, and have a few other neat features. For help with using the bot, use ``.help`` for a list of available topics.");
			}
			break;
		case 'c':
			if (toId(split[2]) === Config.username) return;

			var roomid = split[0].slice(1, -1);
			split[3] = split.splice(3).join('|');
			if (split[3].startsWith(Config.commandSymbol)) {
				this.parseCommand(split[2], roomid, split[3]);
			}
			this.analyze(roomid, split[3], split[2]);
			break;
		case 'c:':
			if (toId(split[3]) === Config.username) return;

			var roomid = split[0].slice(1, -1);
			split[4] = split.splice(4).join('|');
			if (split[4].startsWith(Config.commandSymbol)) {
				this.parseCommand(split[3], roomid, split[4]);
			}
			this.analyze(roomid, split[4], split[3]);
			break;
		case 'raw':
			var html = cheerio.load(split.slice(2).join('|'));
			if (html('.username').text() && Config.checkIps && split[0].substr(1).trim() !== 'staff') {
				this.parseIP(html);
			}
			break;
		}
	},

	sendPM: function(user, message) {
		Connection.send('|/w ' + user + ', ' + message);
	},

	analyze: function(room, message, userstr) {
		for (var i in this.analyzers) {
			if (!this.analyzers[i].rooms || this.analyzers[i].rooms.indexOf(room) > -1) {
				this.analyzers[i].parser(room, message, userstr);
			}
		}
		Databases.writeDatabase('data');
	}
};
