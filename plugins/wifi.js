'use strict';

const fs = require('fs');

const server = require('../server.js');
const databases = require('../databases.js');

const WIFI_ROOM = 'wifi';
const BREEDING_ROOM = 'breeding';
const special = {KIDA: server.url, WIFIFORUM: "http://showdownwifi.freeforums.org/", BREEDINGSITE: "http://psbreeding.weebly.com/"};

let faqdata;

function loadFaqs() {
	let data;
	try {
		data = require('../data/faqs.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeFaqs() {
	let toWrite = JSON.stringify(faqdata);
	fs.writeFileSync('./data/faqs.json', toWrite);
}

let tsvs;

function loadTsvs() {
	let data;
	try {
		data = require('../data/tsvs.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeTsvs() {
	let toWrite = JSON.stringify(tsvs);
	fs.writeFileSync('./data/tsvs.json', toWrite);
}

databases.addDatabase('faqs', loadFaqs, writeFaqs);
faqdata = databases.getDatabase('faqs');
databases.addDatabase('tsvs', loadTsvs, writeTsvs);
tsvs = databases.getDatabase('tsvs');

// Very ugly but meh
let toTSV = val => (val < 1000 ? '0' : '') + (val < 100 ? '0' : '') + (val < 10 ? '0' : '') + val;

module.exports = {
	commands: {
		faq: {
			rooms: [WIFI_ROOM, BREEDING_ROOM],
			action(message) {
				let room = this.room || WIFI_ROOM;
				let faqList = {};
				if (room === WIFI_ROOM) {
					faqList = faqdata.wifi;
				} else if (room === BREEDING_ROOM) {
					faqList = faqdata.breeding;
				} else {
					return this.pmreply("This command can only be used in the wifi or breeding room.");
				}

				if (!message) return this.pmreply("Usage: ``.faq <topic>``. For a list of topics, use ``.faq help``.");
				message = toId(message);
				if (!(message in faqList)) return this.pmreply("Invalid option for topic.");

				if (this.canUse(1)) {
					return this.reply(faqList[message]);
				}
				this.pmreply(faqList[message]);
				if (this.room && this.room === WIFI_ROOM) {
					this.pmreply("Also, remember you can use commands in PM too. This helps reduce clutter in the room.");
				}
			},
		},
		addfaq: {
			rooms: [WIFI_ROOM, BREEDING_ROOM],
			hidden: true,
			action(message) {
				let split = message.split(',').map(param => param.trim());
				if (!this.room) {
					if (split.length < 3) return this.pmreply("Invalid amount of arguments.");
					let room = toId(split.splice(0, 1)[0]);
					if (!this.getRoomAuth(room)) return;
					if (room !== WIFI_ROOM && room !== BREEDING_ROOM) return this.pmreply("This command can only be used in the wifi or breeding room.");
					this.room = room;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");
				let faqList = {};
				if (this.room === WIFI_ROOM) {
					faqList = faqdata.wifi;
				} else if (this.room === BREEDING_ROOM) {
					faqList = faqdata.breeding;
				} else {
					return this.pmreply("This command can only be used in the wifi or breeding room.");
				}

				if (split.length < 2) return this.pmreply("Invalid amount of arguments.");
				let faqMessage = split[1];
				for (let i in special) {
					faqMessage.replace('{' + i + '}', special[i]);
				}
				faqList[toId(split[0])] = faqMessage;
				databases.writeDatabase('faqs');
				return this.pmreply("Faq topic " + split[0] + " added.");
			},
		},
		removefaq: {
			rooms: [WIFI_ROOM, BREEDING_ROOM],
			hidden: true,
			action(message) {
				let split = message.split(',').map(param => param.trim());
				if (!this.room) {
					if (split.length < 2) return this.pmreply("Invalid amount of arguments.");
					let room = toId(split.splice(0, 1)[0]);
					if (!this.getRoomAuth(room)) return;
					if (room !== WIFI_ROOM && room !== BREEDING_ROOM) return this.pmreply("This command can only be used in the wifi or breeding room.");
					this.room = room;
				}
				if (!this.canUse(5)) return this.pmreply("Permission denied.");
				let faqList = {};
				if (this.room === WIFI_ROOM) {
					faqList = faqdata.wifi;
				} else if (this.room === BREEDING_ROOM) {
					faqList = faqdata.breeding;
				} else {
					return this.pmreply("This command can only be used in the wifi or breeding room.");
				}

				split[0] = toId(split[0]);
				if (!(split[0] in faqList)) return this.pmreply("Invalid option for topic.");
				delete faqList[split[0]];
				databases.writeDatabase('faqs');
				return this.pmreply("Faq topic " + split[0] + " deleted.");
			},
		},
		addtsv: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}

				if (!(this.canUse(2))) return this.pmreply("Permission denied.");

				let [name, tsv] = message.split(',');
				if (!(name && tsv)) return this.pmreply("Syntax: ``.addtsv name, tsv``");

				name = toId(name);
				tsv = parseInt(tsv);
				if (isNaN(tsv) || tsv < 0 || tsv > 4095) return this.pmreply("Invalid value for TSV, should be between 0 and 4096");

				tsvs[name] = tsv;
				databases.writeDatabase('tsvs');

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} added a TSV for ${name}: ${toTSV(tsv)}`);
				this.reply("TSV successfully added.");
			},
		},
		deletetsv: {
			rooms: [WIFI_ROOM],
			action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}

				if (!(this.canUse(2))) return this.pmreply("Permission denied.");

				let name = toId(message);

				if (!(name in tsvs)) return this.pmreply("User not found");

				delete tsvs[name];
				databases.writeDatabase('tsvs');

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} deleted a TSV for ${name}`);
				this.reply("TSV successfully deleted.");
			},
		},
		tsv: {
			rooms: [WIFI_ROOM],
			permission: 1,
			action(message) {
				if (!message) return;

				let tsv = parseInt(message);

				if (isNaN(tsv) || tsv < 0 || tsv > 4095) return this.pmreply("Invalid value for TSV, should be between 0 and 4096");

				let matches = [];

				for (let i in tsvs) {
					if (tsvs[i] === tsv) {
						matches.push(i);
					}
				}

				if (matches.length) {
					return this.reply(`This TSV belongs to ${matches.join(', ')}.`);
				}

				return this.reply("No matches found.");
			},
		},
	},
};
