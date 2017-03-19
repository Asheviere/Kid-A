'use strict';

const server = require('../server.js'); // eslint-disable-line no-unused-vars
const redis = require('../redis.js');

const WIFI_ROOM = 'wifi';

let tsvs = redis.useDatabase('tsv');

// Very ugly but meh
let toTSV = val => (val < 1000 ? '0' : '') + (val < 100 ? '0' : '') + (val < 10 ? '0' : '') + val;

module.exports = {
	commands: {
		addtsv: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}

				if (!(this.canUse(2))) return this.pmreply("Permission denied.");

				let [name, tsv] = message.split(',');
				if (!(name && tsv)) return this.pmreply("Syntax: ``.addtsv name, tsv``");

				name = toId(name);
				tsv = parseInt(tsv);
				if (isNaN(tsv) || tsv < 0 || tsv > 4095) return this.pmreply("Invalid value for TSV, should be between 0 and 4096");
				tsv = toTSV(tsv);

				await tsvs.set(name, tsv);

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} added a TSV for ${name}: ${tsv}`);
				this.reply("TSV successfully added.");
			},
		},
		deletetsv: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}

				if (!(this.canUse(2))) return this.pmreply("Permission denied.");

				let name = toId(message);

				if (!(await tsvs.exists(name))) return this.pmreply("User not found");

				await tsvs.del(name);

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} deleted a TSV for ${name}`);
				this.reply("TSV successfully deleted.");
			},
		},
		tsv: {
			rooms: [WIFI_ROOM],
			permission: 1,
			async action(message) {
				if (!message) return;

				let tsv = parseInt(message);
				if (isNaN(tsv) || tsv < 0 || tsv > 4095) return this.pmreply("Invalid value for TSV, should be between 0 and 4096");
				tsv = toTSV(tsv);

				let matches = [];

				let keys = await tsvs.keys('*');

				for (let i = 0; i < keys.length; i++) {
					if ((await tsvs.get(keys[i])) === tsv) matches.push(keys[i]);
				}

				if (matches.length) {
					return this.reply(`This TSV belongs to ${matches.join(', ')}.`);
				}

				return this.reply("No matches found.");
			},
		},
	},
};
