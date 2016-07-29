'use strict';

const DAY = 24 * 60 * 60 * 1000;

let motds = Object.create(null);

let motdTimers = {};

module.exports = {
	options: ['announcemotd'],
	commands: {
		motd(userstr, room, message) {
			if (!room) {
				if (!message) return this.reply("No room specified.");
				room = message;
				message = null;
			}

			if (!message) {
				if (!canUse(userstr, 1)) return this.pmreply("Permission denied.");
				if (!(room in motds)) return this.reply("This room does not have a motd set.");

				return this.reply((this.settings[room] && this.settings[room].announcemotd ? '/wall ' : '') + "This room's motd is: " + motds[room]);
			}

			if (!canUse(userstr, 3)) return this.pmreply("Permission denied.");

			if (message.length > 200) return this.reply("Message too long.");

			if (room in motdTimers) clearTimeout(motdTimers[room]);

			motdTimers[room] = setTimeout(() => delete motds[room], DAY);
			motds[room] = message;

			return this.reply("The motd was successfully set.");
		},

		clearmotd(userstr, room) {
			if (!canUse(userstr, 3)) return this.pmreply("Permission denied.");
			if (!(room in motds)) return this.reply("This room does not have a motd set.");

			// Failsafe
			if (room in motdTimers) clearTimeout(motdTimers[room]);

			delete motds[room];

			return this.reply("The motd was successfully cleared.");
		},
	},
};
