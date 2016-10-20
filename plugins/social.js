'use strict';

const DAY = 24 * 60 * 60 * 1000;

let motds = Object.create(null);

let motdTimers = {};

module.exports = {
	options: ['announcemotd'],
	commands: {
		motd(message) {
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

		clearmotd() {
			if (!this.canUse(3)) return this.pmreply("Permission denied.");
			if (!(this.room in motds)) return this.reply("This room does not have a motd set.");

			// Failsafe
			if (this.room in motdTimers) clearTimeout(motdTimers[this.room]);

			delete motds[this.room];

			return this.reply("The motd was successfully cleared.");
		},
	},
};
