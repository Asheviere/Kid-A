'use strict';

const utils = require('../utils.js');
const server = require('../server.js');

const helpTopics = {
	commands: 'commands.html',
	wifi: 'wifi.html',
};

const REPO_URL = 'https://github.com/bumbadadabum/Kid-A';

module.exports = {
	commands: {
		help(userstr, room, message) {
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			if (!message) return {reply: "Usage: ``.help <topic>``. Available help topics: " + Object.keys(helpTopics).join(', ')};

			message = toId(message);
			if (!(message in helpTopics)) return {pmreply: "Invalid option for topic."};

			return {reply: server.url + helpTopics[message]};
		},
		git(userstr) {
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			return {reply: "Source code for Kid A: " + REPO_URL};
		},
		data(userstr, room) {
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			if (Data.data[room]) {
				let fname;
				if (Config.privateRooms.has(room)) {
					fname = utils.generateTempFile(Handler.generateDataPage(room), 15, true);
				} else {
					fname = room + "/data";
				}
				return {reply: "Chat data: " + server.url + fname};
			}

			return {reply: "This room has no data."};
		},
	},
};
