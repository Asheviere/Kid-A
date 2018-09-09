'use strict';

const redis = require('./redis.js');

const MINUTE = 1000 * 60;
const MAX_PRUNE_AMOUNT = 2000;

let leftpad = val => (val < 10 ? `0${val}`: `${val}`);

function lastMonth(today, day, month) {
	if (today.getUTCMonth() + 1 === month) return true;
	if (today.getUTCDate() < day && !(today.getUTCMonth() > month)) return true;

	return false;
}

class ChatLogger {
	constructor() {
		this.logs = redis.useDatabase('logs');
		this.seen = redis.useDatabase('seen');

		this.queue = [];
		this.queuedOperations = [];
		this.syncing = false;

		setInterval(async () => {
			this.syncing = true;
			let oldqueue = this.queue;
			this.queue = {};

			if (Object.keys(oldqueue).length) {
				await this.logs.multi();
				for (let key in oldqueue) {
					oldqueue[key].unshift(key);
					this.logs.hmset.apply(this.logs, oldqueue[key]);
				}
				await this.logs.exec();
			}

			this.queuedOperations.forEach(val => val());

			this.syncing = false;
		}, 2 * MINUTE);

		setInterval(this.pruneAll.bind(this), 24 * 60 * MINUTE);

		this.pruneAll();
	}

	waitForSync() {
		return new Promise(resolve => {
			if (!this.syncing) resolve();

			this.queuedOperations.push(resolve);
		});
	}

	async getRooms() {
		let rooms = new Set();

		let keys = await this.logs.keys('*');

		for (let i = 0; i < keys.length; i++) {
			let roomid = keys[i].split(':')[0];
			rooms.add(roomid);
		}

		return Array.from(rooms);
	}

	async log(timestamp, room, userid, message) {
		if (Config.disableLogging) return;

		timestamp = parseInt(timestamp);
		if (isNaN(timestamp) || !userid || !room) return;

		timestamp = timestamp * 1000;
		let date = new Date(timestamp);

		let key = `${room}:${userid}`;

		if (!(key in this.queue)) {
			this.queue[key] = [];
		}

		this.queue[key].push(`${leftpad(date.getUTCDate())}:${leftpad(date.getUTCMonth() + 1)}:${leftpad(date.getUTCHours())}:${leftpad(date.getMinutes())}:${leftpad(date.getSeconds())}`);
		this.queue[key].push(Config.logMessages ? message : '1');

		if (!Handler.privateRooms.has(room)) this.seen.set(userid, timestamp);
	}

	async getLineCount(room, userid) {
		await this.waitForSync();

		let linecount = await this.logs.hkeys(`${room}:${userid}`);
		let output = {};

		// used for pruning
		let today = new Date();
		let toPrune = [];

		for (let key of linecount) {
			let [day, month] = key.split(':').map(val => parseInt(val));

			if (!lastMonth(today, day, month)) {
				toPrune.push(key);
				continue;
			}

			let outputkey = `${leftpad(day)}/${leftpad(month)}`;
			if (outputkey in output) {
				output[outputkey] ++;
			} else {
				output[outputkey] = 1;
			}
		}

		if (toPrune.length) {
			toPrune.unshift(`${room}:${userid}`);
			this.logs.hdel.apply(this.logs, toPrune);
		}

		return output;
	}

	async getUserActivity(room, options) {
		await this.waitForSync();

		let users = await this.logs.keys(`${room}:*`);

		let output = {};

		// used for pruning
		let today = new Date();

		for (let i = 0; i < users.length; i++) {
			let user = users[i].split(':')[1];

			let keys = await this.logs.hkeys(users[i]);

			let toPrune = keys.filter(key => !lastMonth(today, parseInt(key.split(':')[0]), parseInt(key.split(':')[1])));
			keys = keys.filter(key => !toPrune.includes(key));

			if (options.day) {
				keys = keys.filter(key => key.split(':')[0] === leftpad(today.getUTCDate()) && key.split(':')[1] === leftpad(today.getUTCMonth() + 1));
			}

			if (options.time) {
				let hour = leftpad(options.time);

				keys = keys.filter(key => key.split(':')[2] === hour);
			}

			output[user] = keys.length;

			if (toPrune.length) {
				toPrune.unshift(users[i]);
				this.logs.hdel.apply(this.logs, toPrune);
			}
		}

		return Object.entries(output).sort((a, b) => (a[1] > b[1] ? -1 : 1));
	}

	async getRoomActivity(room) {
		await this.waitForSync();

		let users = await this.logs.keys(`${room}:*`);

		let output = {};

		// used for pruning
		let today = new Date();

		for (let i = 0; i < users.length; i++) {
			let userlogs = await this.logs.hkeys(users[i]);

			let toPrune = [];

			for (let time of userlogs) {
				let [day, month, hour] = time.split(':').map(val => parseInt(val));

				if (!lastMonth(today, day, month)) {
					toPrune.push(time);
					continue;
				}

				if (hour in output) {
					output[hour] ++;
				} else {
					output[hour] = 1;
				}
			}

			if (toPrune.length) {
				toPrune.unshift(users[i]);
				this.logs.hdel.apply(this.logs, toPrune);
			}
		}

		return Object.entries(output).sort((a, b) => (parseInt(a[0]) > parseInt(b[0]) ? 1 : -1));
	}

	async getUniqueUsers(room) {
		await this.waitForSync();

		return (await this.logs.keys(`${room}*`)).length;
	}

	async getLastSeen(userid) {
		await this.waitForSync();

		return (await this.seen.get(userid));
	}

	async prune(keys) {
		// Pace the pruning to avoid overloading the redis server.
		for (let user of keys.slice(0, MAX_PRUNE_AMOUNT)) {
			let linecount = await this.logs.hkeys(user);

			let today = new Date();
			let toPrune = [];

			for (let key of linecount) {
				let [day, month] = key.split(':').map(val => parseInt(val));

				if (!lastMonth(today, day, month)) {
					toPrune.push(key);
				}
			}

			if (toPrune.length) {
				toPrune.unshift(user);
				this.logs.hdel.apply(this.logs, toPrune);
			}
		}

		let rest = keys.slice(MAX_PRUNE_AMOUNT);
		if (rest.length) setTimeout(() => this.prune(rest), MINUTE);
	}

	async pruneAll() {
		let keys = await this.logs.keys('*');

		this.prune(keys);
	}
}

module.exports = new ChatLogger();

