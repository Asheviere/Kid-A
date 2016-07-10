'use strict';

const fs = require('fs');

const CLONER_FILE = './data/cloners.tsv';
const COLUMN_NAMES = ['PS Username', 'Friend code', 'IGN', 'Notes', 'Date of last giveaway'];
const COLUMN_KEYS = ['username', 'fc', 'ign', 'notes', 'lastga'];

function loadCloners() {
	let cloners = Object.create(null);
	let data = fs.readFileSync(CLONER_FILE);
	data = ('' + data).split("\n");
	for (let i = 0; i < data.length; i++) {
		if (!data[i] || data[i] === '\r') continue;
		let row = data[i].trim().split("\t");
		if (row[0] === COLUMN_NAMES[0]) continue;

		let userid = toId(row[0]);
		cloners[userid] = {};
		for (let i = 0; i < COLUMN_KEYS.length; i++) {
			cloners[userid][COLUMN_KEYS[i]] = row[i];
		}
	}

	return cloners;
}

function writeCloners() {
	let toWrite = COLUMN_NAMES.join('\t') + "\n";
	for (let i in Data.cloners) {
		toWrite += Data.cloners[i].values.join('\t') + '\n';
	}
	fs.writeFileSync('./data/cloners.tsv', toWrite);
}

function addCloner(info) {
	let userid = toId(info[0]);
	Data.cloners[userid] = {};
	info.push(Date.now());
	for (let i = 0; i < COLUMN_KEYS.length; i++) {
		Data.cloners[userid][COLUMN_KEYS[i]] = info[i];
	}
	fs.appendFileSync(CLONER_FILE, info.join('\t') + '\n');
}

Databases.addDatabase('cloners', loadCloners, writeCloners);

module.exports = {
	commands: {
		addcloner(userstr, room, message) {
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let params = message.split(',').map(param => param.trim());
			if (params.length !== COLUMN_KEYS.length - 1) return {reply: "Invalid amount of arguments"};
			if (toId(params[0]) in Data.cloners) return {reply: "'" + params[0] + "' is already a cloner."};
			addCloner(params);
			return {reply: "'" + params[0] + "' was successfully added to the cloner list."};
		},
		removecloner(userstr, room, message) {
			if (!canUse(userstr, 4)) return {pmreply: "Permission denied."};

			let userid = toId(message);
			if (!(userid in Data.cloners)) return {reply: "User is not on the cloner list."};
			delete Data.cloners[userid];
			Databases.writeDatabase('cloners');
			return {reply: "User successfully removed."};
		},
	},
};
