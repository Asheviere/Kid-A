'use strict';

const server = require('../server.js');
const Page = require('../page.js');
const redis = require('../redis.js');

const db = redis.useDatabase('settings');

const settingsPage = new Page('settings', settingsGenerator, 'settings.html', {token: 'settings', postHandler: changeSettings});

async function changeSettings(settings, room) {
	let output = '';
	let changed = false;
	let options = await db.lrange(`${room}:options`, 0, -1);
	let disabled = await db.lrange(`${room}:disabledCommands`, 0, -1);
	for (let key in settings) {
		if (key in Handler.chatHandler.commands && !Handler.chatHandler.commands[key].hidden) {
			if (settings[key]) {
				if (!disabled.includes(key)) {
					disabled.push(key);
					db.rpush(`${room}:disabledCommands`, key);
					changed = true;
				}
			} else {
				let idx = disabled.indexOf(key);
				if (idx > -1) {
					disabled.splice(idx, 1);
					db.lrem(`${room}:disabledCommands`, 0, key);
					changed = true;
				}
			}
		} else if (Handler.chatHandler.options.has(key)) {
			if (settings[key]) {
				if (!options.includes(key)) {
					options.push(key);
					db.rpush(`${room}:options`, key);
					changed = true;
				}
			} else {
				let idx = options.indexOf(key);
				if (idx > -1) {
					options.splice(idx, 1);
					db.lrem(`${room}:options`, 0, key);
					changed = true;
				}
			}
		} else {
			if (!output) output += "Your query contained invalid settings:";
			output += " " + key;
		}
	}
	if (output) {
		if (changed) output += ". The rest of the query has been processed, and settings have been updated accordingly.";
	} else {
		output += "Settings updated successfully.";
	}
	return output;
}

async function settingsGenerator(room) {
	if (!(room && room in Handler.chatHandler.settings)) return `Room '${room}' has no available settings.`;

	let enabledOptions = await db.lrange(`${room}:options`, 0, -1);
	let disabled = await db.lrange(`${room}:disabledCommands`, 0, -1);

	let options = [];
	Handler.chatHandler.options.forEach(val => {
		options.push({name: val, checked: enabledOptions.includes(val)});
	});

	let commands = Object.keys(Handler.chatHandler.commands).filter(cmd => !(Handler.chatHandler.commands[cmd].hidden || (Handler.chatHandler.commands[cmd].rooms && !Handler.chatHandler.commands[cmd].rooms.includes(room)))).map(val => ({name: val, checked: disabled.includes(val)}));

	return {room: room, options: options, commands: commands};
}

const curRooms = new Set();

module.exports = {
	async init() {
		let rooms = await ChatLogger.getRooms();

		for (let i = 0; i < rooms.length; i++) {
			settingsPage.addRoom(rooms[i]);
			curRooms.add(rooms[i]);
		}
	},
	commands: {
		settings: {
			hidden: true,
			async action(message) {
				let room = this.room || toId(message);
				if (!room) return this.reply("Please specify the room when using this command in PM.");
				if (!this.getRoomAuth(room)) return;
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (!this.settings[room]) this.settings[room] = {options: [], disabledCommands: []};

				if (!curRooms.has(room)) {
					settingsPage.addRoom(room);
					server.restart();
					curRooms.add(room);
				}

				this.pmreply(`Settings for room ${room}: ${settingsPage.getUrl(room, this.userid)}`);
			},
		},
	},
};
