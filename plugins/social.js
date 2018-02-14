'use strict';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const server = require('../server.js');
const Page = require('../page.js');
const Cache = require('../cache.js');

let motds = Object.create(null);
let cache = new Cache('social');

let motdTimers = {};
let repeatTimers = {};

let repeatsPage = new Page('repeats', repeatGenerator, 'repeats.html', {token: 'repeats', postHandler: editRepeats});

async function editRepeats(data) {
	let deletes = [];

	for (let i in cache.get('repeats')) {
		if (data.includes(i)) deletes.push(i);
	}

	for (let key of deletes) {
		clearTimeout(repeatTimers[key]);
		cache.deleteProperty('repeats', key);
		delete repeatTimers[key];
	}

	cache.write();
}

async function repeatGenerator(room) {
	let repeats = [];

	for (let i in cache.get('repeats')) {
		let repeatObj = cache.get('repeats')[i];
		if (repeatObj.room === room) repeats.push({id: i, msg: repeatObj.msg, times: repeatObj.timesLeft});
	}
	return {room: room, data: repeats};
}

for (let i in cache.get('motd')) {
	motdTimers[i] = setTimeout(() => destroyMotd(i), cache.get('motd')[i].end - Date.now());
	motds[i] = cache.get('motd')[i].message;
}

for (let i in cache.get('repeats')) {
	repeatTimers[i] = setTimeout(() => runRepeat(i), cache.get('repeats')[i].interval * MINUTE);
}

function setMotd(room, message, endTime) {
	if (!endTime) endTime = Date.now() + DAY;
	if (room in motdTimers) clearTimeout(motdTimers[room]);
	motdTimers[room] = setTimeout(() => destroyMotd(room), endTime - Date.now());
	motds[room] = message;
	cache.setProperty('motd', room, {end: endTime, message: message});
	cache.write();
}

function destroyMotd(room) {
	clearTimeout(motdTimers[room]);
	delete motds[room];
	cache.deleteProperty('motd', room);
	cache.write();
}

function runRepeat(id) {
	let obj = cache.get('repeats')[id];
	if (!obj) return; // failsafe
	if (obj.timesLeft--) {
		Connection.send(`${obj.room}|${obj.msg}`);
		repeatTimers[id] = setTimeout(() => runRepeat(id), obj.interval * MINUTE);
	} else {
		cache.deleteProperty('repeats', id);
		delete repeatTimers[id];
	}

	cache.write();
}

const rooms = new Set();

module.exports = {
	options: ['announcemotd'],
	async init() {
		for (let i in cache.get('repeats')) {
			let room = i.split('|')[0];
			if (rooms.has(room)) continue;
			rooms.add(room);
			repeatsPage.addRoom(room);
		}
	},
	commands: {
		motd: {
			permission: 1,
			async action(message) {
				let room = this.room || message;
				if (room === message) message = null;
				if (!room) {
					if (!message) return this.reply("No room specified.");
				}

				if (!message) {
					if (!(room in motds)) return this.reply("This room does not have a motd set.");

					let options = await this.settings.lrange(`${room}:options`, 0, -1);
					return this.reply((options && options.includes('announcemotd') ? '/wall ' : '') + "This room's motd is: " + motds[room]);
				}

				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				if (message.length > 200) return this.reply("Message too long.");

				setMotd(room, message);
				return this.reply("The motd was successfully set.");
			},
		},

		clearmotd: {
			permission: 3,
			hidden: true,
			async action() {
				if (!(this.room in motds)) return this.reply("This room does not have a motd set.");

				destroyMotd(this.room);
				return this.reply("The motd was successfully cleared.");
			},
		},

		repeat: {
			permission: 3,
			disallowPM: true,
			allowGroupchats: true,
			async action(message) {
				let [interval, times, ...repeatMsg] = message.split(',');
				if (!(interval && times && repeatMsg.length)) return this.pmreply("Syntax: .repeat <interval>, <times>, <message to repeat>");

				interval = Number(interval);
				if (!interval) return this.pmreply("Invalid value for interval.");

				times = Number(times);
				if (!times) return this.pmreply("Invalid value for times");

				repeatMsg = repeatMsg.join(',').trim();

				if (repeatMsg.startsWith('!') || (repeatMsg.startsWith('/') && !(repeatMsg.startsWith('/announce ') || repeatMsg.startsWith('/wall ')))) return this.pmreply ("Please do not enter commands in ``.repeat`` except for ``/announce``");

				let id = `${this.room}|${toId(repeatMsg)}`;
				if (id in cache.get('repeats')) return this.pmreply("This message is already being repeated.");

				if (!rooms.has(this.room)) {
					rooms.add(this.room);
					repeatsPage.addRoom(this.room);
					setTimeout(() => server.restart(), 500);
				}

				let repeatObj = {msg: repeatMsg, timesLeft: times, interval: interval, room: this.room};
				cache.setProperty('repeats', id, repeatObj);
				repeatTimers[id] = setTimeout(() => runRepeat(id), MINUTE * interval);
				cache.write();
				return this.reply(repeatMsg);
			},
		},

		clearrepeat: {
			permission: 3,
			hidden: true,
			disallowPM: true,
			allowGroupchats: true,
			async action(message) {
				let id = `${this.room}|${toId(message)}`;
				if (id in cache.get('repeats')) {
					clearTimeout(repeatTimers[id]);
					cache.deleteProperty('repeats', id);
					delete repeatTimers[id];
					this.reply("Stopped repeating this message.");
					cache.write();
				} else {
					this.pmreply("This message isn't being repeated right now.");
				}
			},
		},

		clearrepeats: {
			permission: 3,
			hidden: true,
			disallowPM: true,
			allowGroupchats: true,
			async action() {
				for (let id in cache.get('repeats')) {
					if (id.startsWith(this.room)) {
						clearTimeout(repeatTimers[id]);
						cache.deleteProperty('repeats', id);
						delete repeatTimers[id];
					}
				}

				cache.write();
				this.reply("Cleared all repeated messages in this room.");
			},
		},

		repeats: {
			permission: 3,
			hidden: true,
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
					return this.pmreply(`Repeats for this room: ${repeatsPage.getUrl(room, this.userid)}`);
				}

				this.reply("This room has no repeats.");
			},
		},
	},
};
