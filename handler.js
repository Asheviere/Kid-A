'use strict';

const request = require('request');
const cheerio = require('cheerio');

const redis = require('./redis.js');
const commandParser = require('./command-parser.js');

const ACTION_URL = 'http://play.pokemonshowdown.com/action.php';

let settings = redis.useDatabase('settings');

const userlists = {};

module.exports = {
	ipQueue: [],
	toJoin: [],
	privateRooms: Config.privateRooms,
	userlists: userlists,
	chatHandler: commandParser.new(userlists, settings),

	checkIp(userid) {
		return new Promise((resolve, reject) => {
			Connection.send(`|/ip ${userid}`);
			this.ipQueue.push({query: userid, resolve: resolve, reject: reject});
		});
	},

	async setup(assertion) {
		Connection.send('|/avatar ' + Config.avatar);
		this.userid = toId(Config.username);

		Array.prototype.push.apply(this.toJoin, Config.rooms);

		let autojoin = await redis.getList(settings, 'autojoin');
		let privateRooms = await redis.getList(settings, 'privaterooms');

		if (autojoin && autojoin.length) {
			Array.prototype.push.apply(
				this.toJoin,
				autojoin.filter(r => !this.toJoin.includes(r))
			);
		}

		if (privateRooms) privateRooms.forEach(val => this.privateRooms.add(val));

		Connection.send('|/autojoin ' + this.toJoin.slice(0, 11).join(','));
		Connection.send('|/trn ' + Config.username + ',0,' + assertion);

		this.extraJoin = this.toJoin.slice(11);

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

		this.chatHandler.parseJoin(user, room);
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
		return this.ipQueue.splice(idx, 1)[0].resolve([userid, ips]);
	},

	async tryJoin(roomid, remove) {
		if (!this.extraJoin) return;
		if (roomid) {
			let idx = this.extraJoin.indexOf(roomid);
			if (idx < 0) return;
			this.extraJoin.splice(idx, 1);
			if (remove) settings.lrem('privaterooms', 0, roomid);
		}
		if (!this.extraJoin.length) return;

		setTimeout(() => Connection.send(`|/join ${this.extraJoin[0]}`), 500);
	},

	async parse(message) {
		if (!message) return;
		let split = message.split('|');
		let first = split[0].split('\n');
		let roomid = toId(first[0]) || 'lobby';
		if (split[0].startsWith('(') || (first.length > 1 && first[1].startsWith('('))) {
			if (split[0].startsWith('(')) roomid = 'lobby';
			this.chatHandler.parseModnote(roomid, first[first.length - 1].slice(1, -1));
		}
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
							this.setup(body.assertion);
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

				this.tryJoin();
			}

			break;
		case 'J':
		case 'j':
			this.addUser(split[2], roomid);
			break;
		case 'L':
		case 'l':
			this.removeUser(split[2], roomid);
			break;
		case 'N':
		case 'n':
			this.removeUser(split[3], roomid);
			this.addUser(split[2], roomid);
			break;
		case 'noinit':
		case 'deinit':
			this.tryJoin(roomid, true);
			break;
		case 'init':
			this.tryJoin(roomid);
			this.addUser(split[6].trim().split(',').slice(1), roomid);
			break;
		case 'pm':
			if (toId(split[2]) === this.userid) return false;

			this.chatHandler.parse(split[2], null, split.splice(4).join('|'));
			break;
		case 'c':
			if (toId(split[2]) === this.userid) return;

			this.chatHandler.parse(split[2], roomid, split.splice(3).join('|'));
			break;
		case 'c:':
			if (toId(split[3]) === this.userid) return;
			let msg = split.splice(4).join('|');
			ChatLogger.log(split[2], roomid, toId(split[3]), msg);
			this.chatHandler.parse(split[3], roomid, msg);
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
