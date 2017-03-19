'use strict';

const redis = require('./redis.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;

let leftpad = val => (val < 10 ? `0${val}`: val);

class ChatLogger {
	constructor() {
		this.logs = redis.useDatabase('logs');
	}

	async getRooms() {
		let keys = await this.logs.keys('*');
		let rooms = [];

		for (let i = 0; i < keys.length; i++) {
			let roomid = keys[i].split(':')[0];
			if (!rooms.includes(roomid)) rooms.push(roomid);
		}

		return rooms;
	}

	async log(timestamp, room, userid, message) {
		timestamp = parseInt(timestamp);
		if (isNaN(timestamp) || !userid || !room) return;

		let date = new Date(timestamp * 1000);

		let key = `${room}:${userid}:${leftpad(date.getUTCDate())}:${leftpad(date.getUTCMonth() + 1)}:${leftpad(date.getUTCHours())}:${leftpad(date.getMinutes())}:${leftpad(date.getSeconds())}`;

		if (await this.logs.exists(key)) {
			this.logs.append(key, `\t${message}`);
		} else {
			await this.logs.set(key, message);
			this.logs.pexpire(key, MONTH);
		}
	}

	async getUserLogs(room, userid) {
		let keys = await this.logs.keys(`${room}:${userid}:*`);
		let output = {};

		for (let i = 0; i < keys.length; i++) {
			let [,, day, month, hour, minute] = keys[i].split(':');
			output[`${day}/${month} ${hour}:${minute}`] = await this.logs.get(keys[i]);
		}

		return output;
	}

	async getLineCount(room, userid) {
		let keys = await this.logs.keys(`${room}:${userid}:*`);
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
		let keys;

		if (day) {
			keys = await this.logs.keys(`${room}:*:${new Date(Date.now()).getUTCDate()}:*`);
		} else {
			keys = await this.logs.keys(`${room}:*`);
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
		let keys = await this.logs.keys(`${room}:*`);
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
		let keys = await this.logs.keys(`${room}:*`);
		let output = new Set();

		for (let i = 0; i < keys.length; i++) {
			let user = keys[i].split(':')[1];
			output.add(user);
		}

		return output.size;
	}
}

module.exports = new ChatLogger();

