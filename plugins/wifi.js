'use strict';

const fs = require('fs');

const Page = require('../page.js');
const redis = require('../redis.js');

const WIFI_ROOM = 'wifi';

let tsvs = redis.useDatabase('tsv');

function renderEditor(room, query) {
	return new Promise(resolve => {
		if (!query.name) return resolve("Invalid URL.");
		fs.readFile(`./public/${room}/${query.name}.html`, (err, data) => {
			let content = '';
			if (err) {
				if (err.code !== 'ENOENT') {
					resolve("Something went wrong loading the file.");
				}
			} else {
				content = String(data);
			}
			resolve({name: query.name, content: content});
		});
	});
}

function saveEdits(data, room, tokenData, query) {
	fs.writeFile(`./public/${room}/${query.name}.html`, data, err => {
		if (err) return Connection.send(`|/pm ${tokenData.user}, Something went wrong saving the file.`);
		Connection.send(`${room}|/modnote ${tokenData.user} updated ${query.name}.html`);
	});
}

const docEditor = new Page('editdoc', renderEditor, 'editdoc.html', {token: 'editdoc', postHandler: saveEdits, postDataType: 'txt', rooms: [WIFI_ROOM]});

async function tsvPageGenerator() {
	let keys = await tsvs.keys('*');
	let entries = [];
	for (const key of keys) {
		let entry = await tsvs.get(key);
		let userTsvs = [];
		for (let i = 0; i < entry.length; i += 4) {
			userTsvs.push(entry.substr(i, 4));
		}
		entries.push([key, userTsvs.join(', ')]);
	}
	return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

new Page('tsv', tsvPageGenerator, 'tsv.html', {rooms: [WIFI_ROOM]});

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

				await tsvs.append(name, tsv);

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

				let name, tsv;
				if (message.includes(',')) [message, tsv] = message.split(',');

				name = toId(message);

				if (tsv) {
					tsv = parseInt(tsv.trim());
					if (isNaN(tsv) || tsv < 0 || tsv > 4095) return this.pmreply("Invalid value for TSV, should be between 0 and 4096");
					tsv = toTSV(tsv);
				}

				if (!(await tsvs.exists(name))) return this.pmreply("User not found");

				if (tsv) {
					let tsvString = await tsvs.get(name);

					for (let i = 0; i < tsvString.length; i += 4) {
						if (tsvString.substr(i, 4) === tsv) {
							let newString = tsvString.slice(0, i) + tsvString.slice(i + 4);
							await tsvs.set(name, newString);
							break;
						}
					}
				} else {
					await tsvs.del(name);
				}

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} deleted a TSV for ${name}`);
				this.reply("TSV successfully deleted.");
			},
		},
		tsv: {
			rooms: [WIFI_ROOM],
			permission: 1,
			async action(message) {
				if (!message) {
					let entry = await tsvs.get(this.userid);
					if (!entry) return this.reply("You don't have a TSV registered.");
					let userTsvs = [];
					for (let i = 0; i < entry.length; i += 4) {
						userTsvs.push(entry.substr(i, 4));
					}
					return this.reply(`Your TSV${userTsvs.length > 1 ? 's' : ''}: ${userTsvs.join(', ')}`);
				}

				let input = message.split(',').map(val => parseInt(val.trim()));
				if (input.some(tsv => isNaN(tsv) || tsv < 0 || tsv > 4095)) return this.pmreply("Invalid value for TSV, should be between 0 and 4096");
				input = input.map(tsv => toTSV(tsv));

				let matches = {};

				let keys = await tsvs.keys('*');

				for (let i = 0; i < keys.length; i++) {
					let entry = await tsvs.get(keys[i]);

					for (let j = 0; j < entry.length; j += 4) {
						let tsv = entry.slice(j, j + 4);

						if (input.includes(tsv)) {
							if (!matches[tsv]) matches[tsv] = [];
							matches[tsv].push(keys[i]);
						}
					}
				}

				if (Object.keys(matches).length) {
					let output = "Found matches: ";
					output += Object.keys(matches).map(i => `${matches[i].join(', ')} (${i})`).join(', ');
					return this.reply(output);
				}

				return this.reply("No matches found.");
			},
		},
		editdoc: {
			rooms: [WIFI_ROOM],
			async action(message) {
				let room = this.room;

				if (!room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
					room = WIFI_ROOM;
				}

				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				const url = docEditor.getUrl(WIFI_ROOM, this.userid, true, {name: toId(message)});
				return this.pmreply(`Edit link: ${url}`);
			},
		},
	},
};
