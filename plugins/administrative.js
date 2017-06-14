'use strict';

const redis = require('../redis.js');
const server = require('../server.js');
const Cache = require('../cache.js');

const DAY = 24 * 60 * 60 * 1000;
const cache = new Cache('admin');

function parseConsole(req, res) {
	let query = server.parseURL(req.url);
	let token = query.token;
	if (!token) return res.end('Please attach an access token. (You should get one when you type .console)');
	let data = server.getAccessToken(token);
	if (!data) return res.end('Invalid access token.');
	if (data.console) {
		if (data.ip && req.ip !== data.ip) server.removeAccessToken(token);
		res.end(stdout);
	} else {
		res.end('Permission denied.');
	}
}

server.addRoute('/console', parseConsole);

let declareObj = cache.get('declare');
let declareTimeout;

if (declareObj.end) {
	declareTimeout = setTimeout(() => {
		declareObj = {};
		declareTimeout = null;
		cache.write();
	}, declareObj.end - Date.now());
}

module.exports = {
	onUserJoin: {
		action(user, room) {
			if (Config.privateRooms.has(room)) return;

			user = toId(user);

			if (declareObj.msg && !declareObj.notified.hasOwnProperty(user) && this.userlists[room] && this.userlists[room][user][0] === '#') {
				Connection.send(`|/pm ${user}, ${declareObj.msg}`);
				declareObj.notified[user] = 1;
			}
		},
	},
	commands: {
		eval: {
			hidden: true,
			action(message) {
				if (!Config.admins.has(this.userid)) return;
				if(/require\(.+?\)/.test(message)) return;

				let ret;
				try {
					ret = JSON.stringify(eval(message));
					if (ret === undefined) return;
				} catch (e) {
					ret = 'Failed to eval ' + message + ': ' + e.toString();
				}
				return this.reply('' + ret);
			},
		},

		reload: {
			hidden: true,
			permission: 6,
			action(message) {
				switch (message) {
				case 'config':
					delete require.cache[require.resolve('../config.js')];
					Config = require('../config.js');
					return this.reply("Config reloaded successfully.");
				case 'server':
					server.restart();
					return this.reply("Server restarted successfully.");
				default:
					return this.pmreply("Invalid option.");
				}
			},
		},

		console: {
			hidden: true,
			permission: 6,
			async action() {
				if (Config.checkIps) {
					let [, ips] = await Handler.checkIp(this.userid);

					let data = {console: true};
					if (ips) data.ip = ips[0];
					let token = server.createAccessToken(data, 15);
					this.pmreply(`Console output: ${server.url}console?token=${token}`);
				} else {
					let token = server.createAccessToken({console: true}, 15);
					this.pmreply(`Console output: ${server.url}console?token=${token}`);
				}
			},
		},

		leave: {
			permission: 5,
			disallowPM: true,
			async action() {
				let autojoin = await redis.getList(this.settings, 'autojoin');

				if (autojoin && autojoin.includes(this.room)) {
					await this.settings.lrem('autojoin', 0, this.room);
				}

				this.reply(`/part ${this.room}`);
			},
		},

		declare: {
			permission: 6,
			hidden: true,
			action(message) {
				let [time, ...msg] = message.split(',');
				if (!msg) return this.pmreply("Invalid syntax. ``.declare days, message``.");
				msg = msg.join(',').trim();
				if (!(time = Number(time))) return this.pmreply("Please enter a valid number for days.");

				if (declareTimeout) {
					clearTimeout(declareTimeout);
				}

				declareObj = {
					msg: msg,
					end: Date.now() + time * DAY,
					notified: {},
				};

				setTimeout(() => {
					declareObj = {};
					declareTimeout = null;
					cache.write();
				}, time * DAY);

				cache.write();

				consoleMsg(`Declare made: ${msg}`);
				this.reply("Declare added");
			},
		},
	},
};
