'use strict';

const DAY = 24 * 60 * 60 * 1000;

let motds = Object.create(null);

let motdTimers = {};

module.exports = {
	options: ['announcemotd'],
	commands: {
		motd(userstr, room, message) {
			if (!room) {
				if (!message) return {reply: "No room specified."};
				room = message;
				message = null;
			}

			if (!message) {
				if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};
				if (!(room in motds)) return {reply: "This room does not have a motd set."};

				return {reply: (Settings[room] && Settings[room].announcemotd ? '/wall ' : '') + "This room's motd is: " + motds[room]};
			}

			if (!canUse(userstr, 3)) return {pmreply: "Permission denied."};

			if (message.length > 200) return {reply: "Message too long."};

			if (room in motdTimers) clearTimeout(motdTimers[room]);

			motdTimers[room] = setTimeout(() => delete motds[room], DAY);
			motds[room] = message;

			return {reply: "The motd was successfully set."};
		},

		clearmotd(userstr, room) {
			if (!canUse(userstr, 3)) return {pmreply: "Permission denied."};
			if (!(room in motds)) return {reply: "This room does not have a motd set."};

			// Failsafe
			if (room in motdTimers) clearTimeout(motdTimers[room]);

			delete motds[room];

			return {reply: "The motd was successfully cleared."};
		},
	},
};
