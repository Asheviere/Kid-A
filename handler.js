'use strict';

const fs = require('fs');

const request = require('request');
const cheerio = require('cheerio');

const commandParser = require('./command-parser.js');
const databases = require('./databases.js');

const ACTION_URL = 'http://play.pokemonshowdown.com/action.php';

let settings;

function loadSettings() {
	let data;
	try {
		data = require('./data/settings.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeSettings() {
	let toWrite = JSON.stringify(settings);

	fs.writeFileSync('./data/settings.json', toWrite);
}

databases.addDatabase('settings', loadSettings, writeSettings);

settings = databases.getDatabase('settings');

const userlists = {};

module.exports = {
	ipQueue: [],
	toJoin: [],
	userlists: userlists,
	chatHandler: commandParser.new(userlists, settings),

	checkIp(userid, resolver) {
		Connection.send('|/ip ' + userid);
		this.ipQueue.push({query: userid, resolver: resolver});
	},

	setup() {
		Connection.send('|/avatar ' + Config.avatar);

		Array.prototype.push.apply(this.toJoin, Config.rooms);

		if (settings.toJoin) {
			Array.prototype.push.apply(
				this.toJoin,
				settings.toJoin.filter(r => !this.toJoin.includes(r))
			);
		}

		Connection.send('|/autojoin ' + this.toJoin.slice(0, 11).join(','));

		statusMsg('Setup done.');
	},

	addUser(user, room) {
		if (!(room in this.userlists)) {
			this.userlists[room] = {};
		}

		if (Array.isArray(user)) {
			this.userlists[room] = {};
			for (let i = 0; i < user.length; i++) {
				this.userlists[room][toId(user[i])] = [user[i][0], toId(user[i])];
			}
			return true;
		}
		this.userlists[room][toId(user)] = [user[0], toId(user)];
	},

	removeUser(user, room) {
		if (!(room in this.userlists)) return false;
		delete this.userlists[room][toId(user)];
	},

	parseIP(html) {
		let userid = toId(html('strong[class=username]').text());
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
		let roomid = split[0].slice(1, -1) || 'lobby';
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

			if (this.toJoin.length > 11) {
				statusMsg('Joining additional rooms...');

				for (let i = 11; i < this.toJoin.length; i++) {
					setTimeout((_i) => {
						Connection.send('|/join ' + this.toJoin[_i]);
					}, (i - 11) * 600, i);
				}
			}

			break;
		case 'J':
			this.addUser(split[2], roomid);
			break;
		case 'L':
			this.removeUser(split[2], roomid);
			break;
		case 'N':
			this.addUser(split[2], roomid);
			this.removeUser(split[3], roomid);
			break;
		case 'init':
			this.addUser(split[6].trim().split(',').slice(1), roomid);
			break;
		case 'pm':
			if (toId(split[2]) === toId(Config.username)) return false;

			this.chatHandler.parse(split[2], null, split.splice(4).join('|'));
			break;
		case 'c':
			if (toId(split[2]) === Config.username) return;

			this.chatHandler.parse(split[2], roomid, split.splice(3).join('|'));
			break;
		case 'c:':
			if (toId(split[3]) === Config.username) return;
			this.chatHandler.parse(split[3], roomid, split.splice(4).join('|'));
			break;
		case 'html':
			let html = cheerio.load(split.slice(2).join('|'));
			if (html('strong[class=username]').text().trim() && Config.checkIps && split[0].substr(1).trim() !== 'staff') {
				this.parseIP(html);
			}
			break;
		}
	},

	sendPM(user, message) {
		Connection.send('|/w ' + user + ', ' + message);
	},
};
