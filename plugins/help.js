'use strict';

const server = require('../server.js');

const helpTopics = {
	commands: 'commands.html'
};

module.exports = {
	commands: {
		help(userstr, room, message) {
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			if (!message) return {reply: "Available help topics: " + Object.keys(helpTopics).join(', ')};

			message = toId(message);
			if (!(message in helpTopics)) return {pmreply: "Invalid option for topic."};

			return {reply: server.url + helpTopics[message]};
		}
	}
};
