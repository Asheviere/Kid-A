'use strict';

const request = require('request');

const redis = require('./redis.js');
const commandParser = require('./command-parser.js');

const ACTION_URL = 'http://play.pokemonshowdown.com/action.php';

let settings = redis.useDatabase('settings');

const userlists = {};

const chatHandler = global.ChatHandler = commandParser.new(userlists, settings);

module.exports = {
	toJoin: [],
	userlists: userlists,
	chatHandler: chatHandler,

	async setup(assertion) {
		chatHandler.send(null, `/avatar ${Config.avatar}`);
		this.userid = toId(Config.username);

		Array.prototype.push.apply(this.toJoin, Config.rooms);

		let autojoin = await settings.lrange('autojoin', 0, -1);

		if (autojoin && autojoin.length) {
			Array.prototype.push.apply(
				this.toJoin,
				autojoin.filter(r => !this.toJoin.includes(r))
			);
		}

		this.toJoin = this.toJoin.filter(room => !(Config.blacklistedRooms && Config.blacklistedRooms.includes(room)));

		Debug.log(3, `Joining rooms: ${this.toJoin.join(', ')}`);

		chatHandler.send(null, `/autojoin ${this.toJoin.slice(0, 11).join(',')}`);
		chatHandler.send(null, `/trn ${Config.username},0,${assertion}`);

		Output.log('status', 'Setup done, loading plugins...');
		ChatHandler.loadPlugins();
	},

	addUser(user, room) {
		if (!(room in this.userlists)) {
			this.userlists[room] = {};
		}

		if (Array.isArray(user)) {
			Debug.log(3, `Adding array of users to userlist of ${room}: ${user}`);
			this.userlists[room] = {};
			for (let i = 0; i < user.length; i++) {
				const username = user[i].slice(1).split('@')[0];
				this.userlists[room][toId(username)] = [user[i][0], username];
			}
			return true;
		}
		const username = user.slice(1).split('@')[0];
		this.userlists[room][toId(username)] = [user[0], username];

		this.chatHandler.parseJoin(user, room);
	},

	removeUser(user, room) {
		if (!(room in this.userlists)) return false;
		delete this.userlists[room][toId(user)];
	},

	async parse(message) {
		if (!message) return;
		let split = message.split('|');
		let first = split[0].split('\n');
		let roomid = first[0].toLowerCase().replace(/[^a-z0-9-]/g, '') || 'lobby';
		if (split[0].startsWith('(') || (first.length > 1 && first[1].startsWith('('))) {
			if (split[0].startsWith('(')) roomid = 'lobby';
			this.chatHandler.parseModnote(roomid, first[first.length - 1].slice(1, -1));
		}
		switch (split[1]) {
		case 'challstr':
			Output.log('status', 'Received challstr, logging in...');

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
							Output.log('client', "Can't log in.");
							process.exit(0);
						}
					} else {
						Output.log('client', "Invalid login request.");
						process.exit(0);
					}
				} else {
					Output.errorMsg(error, `Error logging in.`);
				}
			});
			break;
		case 'updateuser':
			if (split[2].slice(1) !== Config.username) return false;

			Output.log('status', 'Logged in as ' + split[2] + '.');

			const sendJoin = rooms => {
				if (!rooms || !rooms.length) return;
				chatHandler.send(null, `/join ${rooms[0]}`);
				setTimeout(() => sendJoin(rooms.slice(1)), 500);
			};
			sendJoin(this.toJoin.slice(11));

			// Set up REPL when bot is ready to receive messages.
			this.chatHandler.setupREPL();

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
			settings.lrem('autojoin', 0, roomid);
			break;
		case 'init':
			this.chatHandler.rooms.set(roomid, split[4].trim());
			this.chatHandler.parseJoinRoom(roomid);
			this.addUser(split[6].trim().split(',').slice(1), roomid);
			break;
		case 'pm':
			if (toId(split[2]) === this.userid) return false;

			this.chatHandler.parse(split[2], null, split.splice(4).join('|').trim());
			break;
		case 'c':
			if (toId(split[2]) === this.userid) return;

			this.chatHandler.parse(split[2], roomid, split.splice(3).join('|').trim());
			break;
		case 'c:':
			if (toId(split[3]) === this.userid) return;
			let msg = split.splice(4).join('|').trim().split('\n')[0];
			ChatLogger.log(split[2], roomid, toId(split[3]), msg);
			this.chatHandler.parse(split[3], roomid, msg, parseInt(split[1]));
			break;
		case 'tournament':
			let cmds = ('|' + split.slice(1).join('|')).split('\n'); // This is very gross voodoo and there must be a better way to tackle this but I was lazy when writing this.
			for (const cmd of cmds) {
				if (!cmd) continue;
				const cmdsplit = cmd.split('|');
				this.chatHandler.parseTourCommand(roomid, cmdsplit[2], cmdsplit.slice(3).join('|')).catch(err => {
					Output.errorMsg(err, `Error during tour ${cmdsplit[2]} command`, {room: roomid, data: cmdsplit.slice(3).join('|')});
				});
			}
			break;
		case 'queryresponse':
			let json;
			try {
				json = JSON.parse(split[3]);
			} catch (e) {
				Debug.log(1, `Invalid JSON from query response ${split}`);
				return;
			}
			ChatHandler.parseQueryResponse(split[2], json);
			break;
		default:
			Debug.log(5, `Unsupported message type: ${split[1]}`);
		}
	},
};
