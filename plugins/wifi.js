'use strict';

const fs = require('fs');

const server = require('../server.js');
const redis = require('../redis.js');

const WIFI_ROOM = 'wifi';

let tsvs = redis.useDatabase('tsv');

server.addTemplate('editdoc', 'editdoc.html');

function renderEditor(res, name) {
	fs.readFile(`./public/wifi/${name}.html`, (err, data) => {
		let content = '';
		if (err) {
			if (err.code !== 'ENOENT') {
				res.end("Something went wrong loading the file.");
			}
		} else {
			content = String(data);
		}
		console.log(server.renderTemplate('editdoc', {name: name, content: content}));
		return res.end(server.renderTemplate('editdoc', {name: name, content: content}));
	});
}

function docEditResolver(req, res) {
	let query = server.parseURL(req.url);
	let token = query.token;
	let name = query.name;
	if (!name) return res.end("Invalid URL.");
	if (token) {
		let data = server.getAccessToken(token);
		if (data.permission !== 'editdoc') return res.end('Invalid access token.');
		if (req.method === "POST") {
			if (!(req.body && req.body.content)) return res.end("Malformed request.");

			fs.writeFile(`./public/wifi/${name}.html`, req.body.content, err => {
				if (err) return res.end("Something went wrong saving the file.");
				renderEditor(res, name);
			});
		} else {
			renderEditor(res, name);
		}
	} else {
		return res.end('Please attach an access token. (You should get one when you type the command)');
	}
}

server.addRoute(`/${WIFI_ROOM}/editdoc`, docEditResolver);

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
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}

				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				let fname = `editdoc?name=${toId(message)}`;

				let token = server.createAccessToken({user: this.username, permission: 'editdoc'}, 15);
				fname += `&token=${token}`;

				return this.pmreply(`Edit link: ${server.url}${WIFI_ROOM}/${fname}`);
			},
		},
	},
};
