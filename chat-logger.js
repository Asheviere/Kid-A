'use strict';

const redis = require('./redis.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;

let leftpad = val => (val < 10 ? `0${val}`: val);

class ChatLogger {
	constructor() {
		this.logs = {};

		let tables = redis.tables.filter(val => val.startsWith('logs:'));
		for (let i = 0; i < tables.length; i++) {
			let room = tables[i].split(':')[1];
			this.logs[room] = redis.useDatabase(tables[i]);
		}
	}

	async getRooms() {
		return Object.keys(this.logs);
	}

	async log(timestamp, room, userid, message) {
		timestamp = parseInt(timestamp);
		if (isNaN(timestamp) || !userid || !room) return;

		let date = new Date(timestamp * 1000);

		let key = `${userid}:${leftpad(date.getUTCDate())}:${leftpad(date.getUTCMonth() + 1)}:${leftpad(date.getUTCHours())}:${leftpad(date.getMinutes())}:${leftpad(date.getSeconds())}`;

		if (!(room in this.logs)) this.logs[room] = redis.useDatabase(`logs:${room}`);

		if (await this.logs[room].exists(key)) {
			this.logs[room].append(key, `\t${message}`);
		} else {
			await this.logs[room].set(key, message);
			this.logs[room].pexpire(key, MONTH);
		}
	}

	async getUserLogs(room, userid) {
		if (!(room in this.logs)) return {};

		let keys = await this.logs[room].keys(`${userid}:*`);
		let output = {};

		for (let i = 0; i < keys.length; i++) {
			let [,, day, month, hour, minute] = keys[i].split(':');
			output[`${day}/${month} ${hour}:${minute}`] = await this.logs[room].get(keys[i]);
		}

		return output;
	}

	async getLineCount(room, userid) {
		if (!(room in this.logs)) return {};

		let keys = await this.logs[room].keys(`${userid}:*`);
		let output = {};

		for (let i = 0; i < keys.length; i++) {
			let [,, day, month] = keys[i].split(':');
			let key = `${day}/${month}`;
			if (key in output) {
				output[key]++;
			} else {
				output[key] = 1;
			}
		}

		return output;
	}

	async getUserActivity(room, day) {
		if (!(room in this.logs)) return [];

		let keys;

		if (day) {
			keys = await this.logs[room].keys(`*:${new Date(Date.now()).getUTCDate()}:*`);
		} else {
			keys = await this.logs[room].keys(`*`);
		}

		let output = {};

		for (let i = 0; i < keys.length; i++) {
			let user = keys[i].split(':')[1];

			if (user in output) {
				output[user]++;
			} else {
				output[user] = 1;
			}
		}

		return Object.entries(output).sort((a, b) => (a[1] > b[1] ? -1 : 1));
	}

	async getRoomActivity(room) {
		if (!(room in this.logs)) return [];

		let keys = await this.logs[room].keys(`*`);
		let output = {};

		for (let i = 0; i < keys.length; i++) {
			let hour = keys[i].split(':')[4];

			if (hour in output) {
				output[hour]++;
			} else {
				output[hour] = 1;
			}
		}

		return Object.entries(output).sort((a, b) => (parseInt(a[0]) > parseInt(b[0]) ? 1 : -1));
	}

	async getUniqueUsers(room) {
		if (!(room in this.logs)) return 0;

		let keys = await this.logs[room].keys(`*`);
		let output = new Set();

		for (let i = 0; i < keys.length; i++) {
			let user = keys[i].split(':')[1];
			output.add(user);
		}

		return output.size;
	}
}

module.exports = new ChatLogger();

