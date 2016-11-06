'use strict';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

let motds = Object.create(null);
let repeats = Object.create(null);

let motdTimers = {};

function runRepeat(id) {
	let obj = repeats[id];
	if (!obj) return; // failsafe
	if (obj.timesLeft--) {
		Connection.send(`${obj.room}|${obj.msg}`);
		obj.timer = setTimeout(() => runRepeat(id), obj.interval * MINUTE);
	} else {
		delete repeats[id];
	}
}

module.exports = {
	options: ['announcemotd'],
	commands: {
		motd: {
			permission: 3,
			action(message) {
				let room = this.room || message;
				if (room === message) message = null;
				if (!room) {
					if (!message) return this.reply("No room specified.");
				}

				if (!message) {
					if (!this.canUse(1)) return this.pmreply("Permission denied.");
					if (!(room in motds)) return this.reply("This room does not have a motd set.");

					return this.reply((this.settings[this.room] && this.settings[this.room].options.includes('announcemotd') ? '/wall ' : '') + "This room's motd is: " + motds[room]);
				}

				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				if (message.length > 200) return this.reply("Message too long.");

				if (this.room in motdTimers) clearTimeout(motdTimers[this.room]);

				motdTimers[this.room] = setTimeout(() => delete motds[this.room], DAY);
				motds[this.room] = message;

				return this.reply("The motd was successfully set.");
			},
		},

		clearmotd: {
			permission: 3,
			hidden: true,
			action() {
				if (!(this.room in motds)) return this.reply("This room does not have a motd set.");

				// Failsafe
				if (this.room in motdTimers) clearTimeout(motdTimers[this.room]);

				delete motds[this.room];

				return this.reply("The motd was successfully cleared.");
			},
		},

		repeat: {
			permission: 3,
			disallowPM: true,
			action(message) {
				let [interval, times, ...repeatMsg] = message.split(',');
				if (!(interval && times && repeatMsg.length)) return this.pmreply("Syntax: .repeat <interval>, <times>, <message to repeat>");

				interval = Number(interval);
				if (!interval) return this.pmreply("Invalid value for interval.");

				times = Number(times);
				if (!times) return this.pmreply("Invalud value for times");

				repeatMsg = repeatMsg.join(',').trim();

				if (repeatMsg.startsWith('1') || repeatMsg.startsWith('/') && !(repeatMsg.startsWith('/announce ') || repeatMsg.startsWith('/wall '))) return this.pmreply ("Please do not enter commands in ``.repeat`` except for ``/announce``");

				let id = `${this.room}|${toId(repeatMsg)}`;
				if (id in repeats) return this.pmreply("This message is already being repeated.");

				let repeatObj = {timer: setTimeout(() => runRepeat(id), MINUTE * interval), msg: repeatMsg, timesLeft: times, interval: interval, room: this.room};
				repeats[id] = repeatObj;
				return this.reply(repeatMsg);
			},
		},

		clearrepeat: {
			permission: 3,
			hidden: true,
			disallowPM: true,
			action(message) {
				let id = `${this.room}|${toId(message)}`;
				if (id in repeats) {
					clearTimeout(repeats[id].timer);
					delete repeats[id];
					this.reply("Stopped repeating this message.");
				} else {
					this.pmreply("This message isn't being repeated right now.");
				}
			},
		},

		clearrepeats: {
			permission: 3,
			hidden: true,
			disallowPM: true,
			action() {
				for (let id in repeats) {
					if (id.startsWith(this.room)) {
						clearTimeout(repeats[id].timer);
						delete repeats[id];
					}
				}

				this.reply("Cleared all repeated messages in this room.");
			},
		},
	},
};