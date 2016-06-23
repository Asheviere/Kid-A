'use strict';

const fs = require('fs');

const request = require('request');
const cheerio = require('cheerio');

const server = require('./server.js');

const ACTION_URL = 'http://play.pokemonshowdown.com/action.php';

function loadSettings() {
	let data;
	try {
		data = require('./data/settings.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeSettings() {
	let toWrite = JSON.stringify(Data.settings);

	fs.writeFileSync('./data/settings.json', toWrite);
}

function loadData() {
	let data;
	try {
		data = require('./data/data.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeData() {
	let toWrite = JSON.stringify(Data.data);

	fs.writeFileSync('./data/data.json', toWrite);
}

Databases.addDatabase('settings', loadSettings, writeSettings);
global.Settings = Data.settings;
Databases.addDatabase('data', loadData, writeData);

// Load the analyzers and plugins.
let plugins = {};
let analyzers = {};
global.Commands = {};

fs.readdirSync('./plugins')
	.filter((file) => file.endsWith('.js') && !Config.blacklistedPlugins.has(file.slice(0, -3)))
	.forEach((file) => {
		let plugin = require('./plugins/' + file);
		let name = file.slice(0, -3);
		plugins[name] = plugin;
		if (plugin.analyzer) analyzers[name] = plugin.analyzer;
		if (plugin.commands) {
			Object.keys(plugin.commands).forEach((c) => {
				Commands[c] = plugin.commands[c];
			});
		}
	});

function dataResolver(req, res) {
	let room = req.originalUrl.split('/')[1];
	res.end(module.exports.generateDataPage(room));
}

for (let room in Data.data) {
	if (Config.privateRooms.has(room)) continue;
	server.addRoute('/' + room + '/data', dataResolver);
}

module.exports = {
	analyzers: analyzers,
	ipQueue: [],

	checkIp(userid, resolver) {
		Connection.send('|/ip ' + userid);
		this.ipQueue.push({query: userid, resolver: resolver});
	},

	setup() {
		Connection.send('|/avatar ' + Config.avatar);

		this.toJoin = Config.rooms;

		if (Settings.toJoin) {
			this.toJoin = this.toJoin.concat(Settings.toJoin);
		}

		Connection.send('|/autojoin ' + this.toJoin.splice(0, 11).join(','));

		statusMsg('Setup done.');
	},

	parseCommand(userstr, room, message) {
		let username = userstr.substr(1);

		let words = message.split(' ');
		let cmd = words.splice(0, 1)[0].substr(1);
		if (!(cmd in Commands)) {
			if (room) return;
			return this.sendPM(username, 'Invalid command.');
		}

		let user = (!room && userstr[0] === ' ' ? '+' : userstr[0]) + username;
		if (Settings[room] && Settings[room][cmd] === 'off') return;
		let action = Commands[cmd](user, room, words.join(' '));
		if (!action) return;

		if (action.then) {
			action.then(val => this.parseAction(username, room, val));
		} else {
			this.parseAction(username, room, action);
		}
	},

	parseAction(user, room, action) {
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

	parseIP(html) {
		let userid = toId(html('.username').text());
		let split = html.root().html().split('>');
		let ips;
		let previousNames;
		for (let i = 0; i < split.length; i++) {
			if (split[i].trim().startsWith('IP:')) {
				ips = split[i].trim().substr(4).split('<')[0].split(', ');
				break;
			}
			if (split[i].trim().startsWith('Previous names:')) {
				previousNames = split[i].trim().substr(4).split('<')[0].split(', ');
				break;
			}
		}
		let idx = this.ipQueue.findIndex(elem => elem.query === userid);
		if (idx < 0 && previousNames) idx = this.ipQueue.findIndex(elem => previousNames.includes(elem.query));
		if (idx < 0) return;
		if (this.ipQueue[idx].resolver) return this.ipQueue.splice(idx, 1)[0].resolver(userid, ips);
	},

	parse(message) {
		if (!message) return;
		let split = message.split('|');
		if (!split[0]) split[0] = '>lobby\n'; // Zarel can't code

		let roomid;
		switch (split[1]) {
		case 'challstr':
			statusMsg('Received challstr, logging in...');

			let challstr = split.slice(2).join('|');

			request.post(ACTION_URL, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: 'act=login&name=' + Config.username + '&pass=' + Config.password + '&challstr=' + challstr,
			}, (error, response, body) => {
				if (!error && response.statusCode === 200) {
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

				this.toJoin.map((room) => (
					new Promise((resolve) => {
						Connection.send('|/join ' + room);
						setTimeout(resolve, 500);
					})
				)).reduce(
					(thenable, p) => thenable.then(p),
					Promise.resolve()
				);
			}
			break;
		case 'pm':
			if (toId(split[2]) === toId(Config.username)) return false;

			split[4] = split.splice(4).join('|');
			if (split[4].startsWith(Config.commandSymbol)) {
				this.parseCommand(split[2], null, split[4]);
			} else {
				if (canUse(split[2], 2) && split[4].startsWith('/invite')) {
					let room = split[4].substr(8);
					if (!(Config.rooms.includes(room) || (Settings.toJoin && Settings.toJoin.includes(room)))) {
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

			roomid = split[0].slice(1, -1);
			split[3] = split.splice(3).join('|');
			if (split[3].startsWith(Config.commandSymbol)) {
				this.parseCommand(split[2], roomid, split[3]);
			}
			this.analyze(roomid, split[3], split[2]);
			break;
		case 'c:':
			if (toId(split[3]) === Config.username) return;

			roomid = split[0].slice(1, -1);
			split[4] = split.splice(4).join('|');
			if (split[4].startsWith(Config.commandSymbol)) {
				this.parseCommand(split[3], roomid, split[4]);
			}
			this.analyze(roomid, split[4], split[3]);
			break;
		case 'raw':
			let html = cheerio.load(split.slice(2).join('|'));
			if (html('.username').text() && Config.checkIps && split[0].substr(1).trim() !== 'staff') {
				this.parseIP(html);
			}
			break;
		}
	},

	sendPM(user, message) {
		Connection.send('|/w ' + user + ', ' + message);
	},

	analyze(room, message, userstr) {
		for (let i in this.analyzers) {
			let analyzer = this.analyzers[i];
			if (!analyzer.rooms || analyzer.rooms.includes(room)) {
				analyzer.parser(room, message, userstr);
			}
		}
		Databases.writeDatabase('data');
	},

	generateDataPage(room) {
		let content = '<!DOCTYPE html><html><head><link rel="stylesheet" type="text/css" href="../style.css"><title>' + room + ' - Kid A</title></head><body><div class="container">';
		content += "<h1>" + room + ' data:</h1><div class="quotes">';
		for (let i in analyzers) {
			content += '<div class="analyzer">';
			if (analyzers[i].display && (!analyzers[i].rooms || analyzers[i].rooms.includes(room))) {
				content += analyzers[i].display(room);
			}
			content += '</div>';
		}
		return content + '</div></body></html>';
	},
};
