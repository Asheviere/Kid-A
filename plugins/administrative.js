'use strict';

const server = require('../server.js');
const page = require('../page.js');
const redis = require('../redis.js');
const Cache = require('../cache.js');

const DAY = 24 * 60 * 60 * 1000;
const cache = new Cache('admin');

function parseConsole(req, res) {
	let query = page.parseURL(req.url);
	let token = query.token;
	if (!token) return res.end('Please attach an access token. (You should get one when you type .console)');
	let data = server.getAccessToken(token);
	if (!data) return res.end('Invalid access token.');
	if (data.console) {
		if (data.ip && req.ip !== data.ip) server.removeAccessToken(token);
		res.end(Output.stdout);
	} else {
		res.end('Permission denied.');
	}
}

server.addRoute('/console', parseConsole);

let declareTimeout;

if (cache.get('declare').end) {
	declareTimeout = setTimeout(() => {
		cache.set('declare', {});
		declareTimeout = null;
		cache.write();
	}, cache.get('declare').end - Date.now());
}

module.exports = {
	onUserJoin: {
		async action(user, room) {
			user = toId(user);

			if (cache.get('declare').msg && !cache.get('notified').hasOwnProperty(user) && this.userlists[room] && this.userlists[room][user][0] === '#') {
				ChatHandler.sendPM(user, cache.get('declare').msg);
				cache.setProperty('notified', user, 1);
				cache.write();
			}
		},
	},
	commands: {
		eval: {
			hidden: true,
			async action(message) {
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
			async action(message) {
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

		movenamespace: {
			permission: 6,
			hidden: true,
			async action(message) {
				if (!Config.admins.has(this.userid)) return;

				const [table, oldnamespace, newnamespace] = message.split(',').map(param => toId(param));
				if (!(table || oldnamespace || newnamespace)) return this.reply("Syntax: ``.movenamespace table, old, new``");

				if (!redis.tables.includes(table)) return this.reply(`Invalid value for table: ${table}`);

				const db = redis.useDatabase(table);
				const keys = await db.keys(`${oldnamespace}:*`);

				await db.multi();

				for (let key of keys) {
					const newkey = `${newnamespace}:${key.split(':')[1]}`;
					db.rename(key, newkey);
				}

				await db.exec();

				return this.reply(`Renamed namespace ${oldnamespace} to ${newnamespace} in ${table}`);
			},
		},

		console: {
			hidden: true,
			permission: 6,
			async action() {
				let token = server.createAccessToken({console: true}, 15);
				this.pmreply(`Console output: ${server.url}console?token=${token}`);
			},
		},

		leave: {
			permission: 5,
			disallowPM: true,
			async action() {
				let autojoin = await this.settings.lrange('autojoin', 0, -1);

				if (autojoin && autojoin.includes(this.room)) {
					await this.settings.lrem('autojoin', 0, this.room);
				}

				this.reply(`/part ${this.room}`);
			},
		},

		declare: {
			permission: 6,
			hidden: true,
			async action(message) {
				let [time, ...msg] = message.split(',');
				if (!msg) return this.pmreply("Invalid syntax. ``.declare days, message``.");
				msg = msg.join(',').trim();
				if (!(time = Number(time))) return this.pmreply("Please enter a valid number for days.");

				if (declareTimeout) {
					clearTimeout(declareTimeout);
				}

				cache.set('declare', {
					msg: msg,
					end: Date.now() + time * DAY,
				});

				cache.set('notified', {});

				setTimeout(() => {
					cache.set('declare', {});
					declareTimeout = null;
					cache.write();
				}, time * DAY);

				cache.write();

				Output.log('declare', `Declare made: ${msg}`);
				this.reply("Declare added");
			},
		},

		privateroom: {
			permission: 5,
			hidden: true,
			async action(message) {
				let room = this.room || toId(message);
				if (!room) return this.reply("No room specified.");
				if (!this.room) {
					if (!(room in this.userlists)) return this.reply(`Invalid room: ${room}`);
					if (!this.getRoomAuth(room)) return;
				}

				if (ChatHandler.privateRooms.has(room)) {
					if (!(await this.settings.lrem('privaterooms', 0, room))) return this.reply("This room is set as private in the bot's config files. Please contact the bot owner if you wish to unprivate your room.");

					ChatHandler.privateRooms.delete(room);
					return this.reply(`The room ${room} was successfully unprivated.`);
				}

				await this.settings.rpush('privaterooms', room);
				ChatHandler.privateRooms.add(room);
				return this.reply(`The room ${room} was successfully made private.`);
			},
		},
	},
};
