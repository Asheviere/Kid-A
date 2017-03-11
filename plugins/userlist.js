'use strict';

const fs = require('fs');

const redis = require('../redis.js');

let userlists = redis.useDatabase('userlist');

module.exports = {
	commands: {
		addinfo: {
			permission: 2,
			hidden: true,
			disallowPM: true,
			async action(message) {
				let params = message.split(',').map(param => param.trim());

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
					await userlists.hset(`${this.room}:${userid}`, key, info[key]);
				}

				return this.reply('Info successfully added.');
			},
		},

		removeinfo: {
			permission: 2,
			hidden: true,
			disallowPM: true,
			async action(message) {
				let params = message.split(',').map(param => param.trim());

				if (!params.length) return this.reply("No user supplied.");

				let userid = toId(params[0]);

				if (!(userlists.exists(`${this.room}:${userid}`))) return this.reply("User not found in this room's userlist.");

				if (params.length === 1) {
					await userlists.del(`${this.room}:${userid}`);
					return this.reply("User successfully deleted.");
				}

				let keys = await userlists.hkeys(`${this.room}:${userid}`);

				for (let i = 1; i < params.length; i++) {
					let val = toId(params[i]);
					for (let j = 0; j < keys.length; j++) {
						if (toId(keys[j]) === val) {
							await userlists.hdel(`${this.room}:${userid}`, keys[j]);
						}
					}
				}

				return this.reply("Info successfully deleted.");
			},
		},

		info: {
			disallowPM: true,
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
	},
};
