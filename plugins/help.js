'use strict';

const utils = require('../utils.js');
const server = require('../server.js');
const databases = require('../databases.js');

const helpTopics = {
	commands: 'commands.html',
	wifi: 'wifi.html',
};

const REPO_URL = 'https://github.com/bumbadadabum/Kid-A';

module.exports = {
	commands: {
		help(message) {
			if (!this.canUse(1)) return this.pmreply("Permission denied.");

			if (!message) return this.reply("Usage: ``.help <topic>``. Available help topics: " + Object.keys(helpTopics).join(', '));
			message = toId(message);
			if (!(message in helpTopics)) return this.pmreply("Invalid option for topic.");

			return this.reply(server.url + helpTopics[message]);
		},
		git() {
			if (!this.canUse(1)) return this.pmreply("Permission denied.");

			return this.reply("Source code for Kid A: " + REPO_URL);
		},
		data() {
			if (!this.canUse(1)) return this.pmreply("Permission denied.");

			if (databases.getDatabase('data')[this.room]) {
				let fname = this.room + "/data";
				if (Config.privateRooms.has(this.room)) {
					let data = {};
					data[this.room] = true;
					let token = server.createAccessToken(data);
					setTimeout(() => server.removeAccessToken(token), 15 * 60 * 1000);
					fname += '?token=' + token;
				}
				return this.reply("Chat data: " + server.url + fname);
			}

			return this.reply("This room has no data.");
		},
	},
};
