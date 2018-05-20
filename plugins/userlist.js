'use strict';

const Page = require('../page.js');
const server = require('../server.js');
const redis = require('../redis.js');

let userlists = redis.useDatabase('userlist');

async function userlistGenerator(room) {
	let users = await userlists.keys(`${room}:*`);

	let keys = ['username'];
	let data = [];

	for (let i = 0; i < users.length; i++) {
		let userinfo = await userlists.hgetall(users[i]);
		let output = {username: users[i].split(':')[1]};

		field: for (let j in userinfo) {
			output[toId(j)] = userinfo[j];

			for (let k = 0; k < keys.length; k++) {
				if (toId(keys[k]) === toId(j)) continue field;
			}
			keys.push(j);
		}

		data.push(output);
	}

	data = data.map(entry => {
		let output = [];

		for (let i = 0; i < keys.length; i++) {
			if (toId(keys[i]) in entry) {
				output.push(entry[toId(keys[i])]);
			} else {
				output.push('');
			}
		}

		return output;
	});

	return {room: room, columnNames: keys, entries: data};
}

const userlistPage = new Page('userlist', userlistGenerator, 'userlist.html');

let rooms = new Set();

module.exports = {
	async init() {
		let keys = await userlists.keys('*');
		for (let i = 0; i < keys.length; i++) {
			let room = keys[i].split(":")[0];
			if (!rooms.has(room)) {
				rooms.add(room);
				userlistPage.addRoom(room);
			}
		}
	},
	commands: {
		addinfo: {
			hidden: true,
			async action(message) {
				let params = message.split(',').map(param => param.trim());
				let room = this.room;
				if (!room) {
					[room, ...params] = params;
					room = toId(room);
					if (!(room && params.length)) return this.pmreply("Syntax: ``.addinfo room, user, key: value``");
					if (!this.userlists[room]) return this.reply(`Invalid room: ${room}`);
					if (!this.getRoomAuth(room)) return;
				}

				if (!(this.canUse(3))) return this.pmreply("Permission denied.");

				if (!params.length) return this.reply("No user supplied.");

				let userid = toId(params[0]);
				let info = {};

				for (let i = 1; i < params.length; i++) {
					let [key, ...values] = params[i].split(':');
					if (!key || !values.length) return this.pmreply("Syntax error.");

					key = key.trim();
					let value = values.join(':').trim();

					info[key] = value;
				}

				for (let key in info) {
					await userlists.hset(`${room}:${userid}`, key, info[key]);
				}

				if (!rooms.has(room)) {
					rooms.add(room);
					userlistPage.addRoom(room);
					// Wait 500ms to make sure everything's ready.
					setTimeout(() => server.restart(), 500);
				}

				return this.reply('Info successfully added.');
			},
		},

		removeinfo: {
			hidden: true,
			async action(message) {
				let params = message.split(',').map(param => param.trim());
				let room = this.room;
				if (!room) {
					[room, ...params] = params;
					room = toId(room);
					if (!(room && params.length)) return this.pmreply("Syntax: ``.removeinfo room, user, key``");
					if (!this.userlists[room]) return this.reply(`Invalid room: ${room}`);
					if (!this.getRoomAuth(room)) return;
				}

				if (!(this.canUse(3))) return this.pmreply("Permission denied.");

				if (!params.length) return this.reply("No user supplied.");

				let userid = toId(params[0]);

				if (!(userlists.exists(`${room}:${userid}`))) return this.reply("User not found in this room's userlist.");

				if (params.length === 1) {
					await userlists.del(`${room}:${userid}`);
					return this.reply("User successfully deleted.");
				}

				let keys = await userlists.hkeys(`${room}:${userid}`);

				for (let i = 1; i < params.length; i++) {
					let val = toId(params[i]);
					for (let j = 0; j < keys.length; j++) {
						if (toId(keys[j]) === val) {
							await userlists.hdel(`${room}:${userid}`, keys[j]);
						}
					}
				}

				return this.reply("Info successfully deleted.");
			},
		},

		info: {
			disallowPM: true,
			permission: 1,
			async action(message) {
				let params = message.split(',').map(param => param.trim());

				if (!params[0]) params = [this.username];

				let userid = toId(params[0]);

				if (!(userlists.exists(`${this.room}:${userid}`))) return this.reply("User not found in this room's userlist.");

				let entries = await userlists.hgetall(`${this.room}:${userid}`);

				if (params.length === 1) {
					let output = [];
					for (let i in entries) {
						output.push(`${i}: ${entries[i]}`);
					}
					return this.reply(output.join(', '));
				}

				let field = toId(params[1]);

				for (let key in entries) {
					if (toId(key) === field) {
						return this.reply(`${params[1]}: ${entries[key]}`);
					}
				}

				return this.reply("Field not found.");
			},
		},

		userlist: {
			permission: 1,
			async action(message) {
				let room = this.room;
				if (!room) {
					if (message) {
						room = toId(message);
					} else {
						return this.pmreply("No room supplied.");
					}
				}
				if (rooms.has(room)) {
					return this.reply(`Userlist: ${userlistPage.getUrl(room, this.userid)}`);
				}

				return this.reply("This room has no userlist.");
			},
		},
	},
};
