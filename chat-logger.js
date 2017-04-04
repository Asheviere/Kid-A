'use strict';

const redis = require('./redis.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;

let leftpad = val => (val < 10 ? `0${val}`: val);

class ChatLogger {
	constructor() {
		this.logs = redis.useDatabase('logs');

		this.rooms = [];

		this.logs.keys('*').then(keys => {
			for (let i = 0; i < keys.length; i++) {
				let roomid = keys[i].split(':')[0];
				if (!this.rooms.includes(roomid)) this.rooms.push(roomid);
			}
		});
	}

	async log(timestamp, room, userid, message) {
		timestamp = parseInt(timestamp);
		if (isNaN(timestamp) || !userid || !room) return;

		let date = new Date(timestamp * 1000);

		let key = `${leftpad(date.getUTCDate())}:${leftpad(date.getUTCMonth() + 1)}:${leftpad(date.getUTCHours())}:${leftpad(date.getMinutes())}:${leftpad(date.getSeconds())}`;

		if (!(this.rooms.includes(room))) this.rooms.push(room);

		this.logs.hincrby(`${room}:${userid}`, key, 1);
	}

	async getLineCount(room, userid) {
		let linecount = await this.logs.hgetall(`${room}:${userid}`);
		let output = {};

		for (let key in linecount) {
			let [day, month] = key.split(':');
			let outputkey = `${day}/${month}`;
			if (outputkey in output) {
				output[outputkey] += parseInt(linecount[key]);
			} else {
				output[outputkey] = parseInt(linecount[key]);
			}
		}

		return output;
	}

	async getUserActivity(room, day) {
		let users = await this.logs.keys(`${room}:*`);

		let output = {};

		for (let i = 0; i < users.length; i++) {
			let user = users[i].split(':')[1];
			let count = 0;

			if (day) {
				let today = leftpad(new Date(Date.now()).getUTCDate());

				let userlogs = await this.logs.hgetall(users[i]);

				for (let time in userlogs) {
					let day = time.split(':')[0];
					if (day === today) count += parseInt(userlogs[time]);
				}
			} else {
				count = await this.logs.hlen(users[i]);
			}

			output[user] = count;
		}

		return Object.entries(output).sort((a, b) => (a[1] > b[1] ? -1 : 1));
	}

	async getRoomActivity(room) {
		let users = await this.logs.keys(`${room}:*`);

		let output = {};

		for (let i = 0; i < users.length; i++) {
			let userlogs = await this.logs.hgetall(users[i]);

			for (let time in userlogs) {
				let hour = time.split(':')[2];
				if (hour in output) {
					output[hour] += parseInt(userlogs[time]);
				} else {
					output[hour] = parseInt(userlogs[time]);
				}
			}
		}	

		return Object.entries(output).sort((a, b) => (parseInt(a[0]) > parseInt(b[0]) ? 1 : -1));
	}

	async getUniqueUsers(room) {
		return (await this.logs.keys(`${room}*`)).length;
	}
}

module.exports = new ChatLogger();

