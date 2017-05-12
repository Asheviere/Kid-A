'use strict';

const redis = require('./redis.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;

let leftpad = val => (val < 10 ? `0${val}`: `${val}`);

class ChatLogger {
	constructor() {
		this.logs = redis.useDatabase('logs');
		this.seen = redis.useDatabase('seen');

		this.rooms = [];

		this.logs.keys('*').then(keys => {
			for (let i = 0; i < keys.length; i++) {
				let roomid = keys[i].split(':')[0];
				if (!this.rooms.includes(roomid)) this.rooms.push(roomid);
			}
		});
	}

	async log(timestamp, room, userid) {
		timestamp = parseInt(timestamp);
		if (isNaN(timestamp) || !userid || !room) return;

		timestamp = timestamp * 1000;
		let date = new Date(timestamp);

		let key = `${leftpad(date.getUTCDate())}:${leftpad(date.getUTCMonth() + 1)}:${leftpad(date.getUTCHours())}:${leftpad(date.getMinutes())}:${leftpad(date.getSeconds())}`;

		if (!(this.rooms.includes(room))) this.rooms.push(room);

		this.logs.hincrby(`${room}:${userid}`, key, 1);

		if (!Config.privateRooms.has(room)) this.seen.set(userid, timestamp);
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

	async getUserActivity(room, options) {
		let users = await this.logs.keys(`${room}:*`);

		let output = {};

		for (let i = 0; i < users.length; i++) {
			let user = users[i].split(':')[1];
			let count = 0;

			if (options) {
				let userlogs = await this.logs.hgetall(users[i]);
				let keys = Object.keys(userlogs);

				if (options.day) {
					let today = leftpad(new Date(Date.now()).getUTCDate());

					keys = keys.filter(key => key.split(':')[0] === today);
				}

				if (options.time) {
					let hour = leftpad(options.time);

					keys = keys.filter(key => key.split(':')[1] === hour);
				}

				for (let i = 0; i < keys.length; i++) {
					count += parseInt(userlogs[keys[i]]);
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

	async getLastSeen(userid) {
		return (await this.seen.get(userid));
	}
}

module.exports = new ChatLogger();

