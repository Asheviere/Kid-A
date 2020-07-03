'use strict';

const crypto = require('crypto');
const request = require('request');

const redis = require('./redis.js');
const commandParser = require('./command-parser.js');

const ACTION_URL = 'http://play.pokemonshowdown.com/action.php';

let settings = redis.useDatabase('settings');

const userlists = {global: {}};

const chatHandler = global.ChatHandler = commandParser.new(userlists, settings);

// This regex is a work of art (html parsing is awful :( )
const INFOBOX_REGEX = /<div class="infobox"><strong class="username"><small style="display:none">.<\/small>(.+?)<\/small>/;
const IP_REGEX = /<a href="https:\/\/whatismyipaddress.com\/ip\/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})" target="_blank">\1<\/a>/g;
const ALT_REGEX = /Alt: <span class="username">(.+?)<\/span><br \/>/g;
const PROXY_REGEX = /Host: (.+?)\[proxy\??\]/g;

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
		await ChatHandler.loadPlugins();

		Output.log('status', "Loaded plugins, joining rooms...");

		const sendJoin = rooms => {
			if (!rooms || !rooms.length) return this.chatHandler.setupREPL();
			chatHandler.send(null, `/join ${rooms[0]}`);
			setTimeout(() => sendJoin(rooms.slice(1)), 500);
		};
		// This should be enough of a window right???
		setTimeout(() => sendJoin(this.toJoin.slice(11)), 1000);
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
				this.userlists.global[toId(username)] = [user[i][0], username];
			}
			return true;
		}
		const username = user.slice(1).split('@')[0];
		this.userlists[room][toId(username)] = [user[0], username];
		this.userlists.global[toId(username)] = [user[0], username];

		this.chatHandler.parseJoin(user, room);
	},

	removeUser(user, room) {
		const userid = toId(user);

		if (!(room in this.userlists)) return false;
		delete this.userlists[room][userid];

		let found = false;
		for (const roomid in this.userlists) {
			if (this.userlists[roomid][userid]) {
				found = true;
				break;
			}
		}

		if (!found) delete this.userlists.global[userid];
	},

	async parse(message) {
		if (!message) return;
		let split = message.split('|');
		let first = split[0].split('\n');
		let roomid = first[0].toLowerCase().replace(/[^a-z0-9-]/g, '') || 'lobby';
		let msg = '';
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
				
			msg = split.splice(3).join('|').trim();
			
			// Check whether the message is a chat message or a modnote
			if (msg.startsWith('/log')) {
			    	this.chatHandler.parseModnote(roomid, msg.slice(4));
			} else {
				this.chatHandler.parse(split[2], roomid, msg);
			}
			break;
		case 'c:':
			if (toId(split[3]) === this.userid) return;
			msg = split.splice(4).join('|').trim().split('\n')[0];
			// Check whether the message is a chat message or a modnote
			if (msg.startsWith('/log')) {
			    	this.chatHandler.parseModnote(roomid, msg.slice(4));
			} else {
				ChatLogger.log(split[2], roomid, toId(split[3]), msg);
				this.chatHandler.parse(split[3], roomid, msg, parseInt(split[1]));
				break;
			}
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
		case 'html':
			const html = split.slice(1).join('|');

			const whoisMatch = INFOBOX_REGEX.exec(html);
			if (whoisMatch) {
				const res = {username: whoisMatch[1]};

				const ips = [];
				const alts = res.alts = [];

				let match = IP_REGEX.exec(html);
				while (match) {
					const md5 = crypto.createHash('md5');
					ips.push(md5.digest(match[1]));

					match = IP_REGEX.exec(html);
				}

				match = ALT_REGEX.exec(html);
				while (match) {
					alts.push(match[1]);

					match = ALT_REGEX.exec(html);
				}

				res.ipStr = ips.join('|');

				if (html.includes(`(Unregistered)`)) {
					res.unregistered = true;
				}

				if (PROXY_REGEX.test(html)) {
					res.isProxy = true;
				}

				ChatHandler.parseQueryResponse(`whois:${roomid}`, res);
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
			return Debug.log(5, `Unsupported message type: ${split[1]}`);
		}
	},
};
