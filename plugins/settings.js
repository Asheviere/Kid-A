'use strict';

const server = require('../server.js');
const redis = require('../redis.js');

const db = redis.useDatabase('settings');

server.addTemplate('settings', 'settings.html');

async function changeSettings(room, settings) {
	let output = '';
	let changed = false;
	let options = await redis.getList(db, `${room}:options`);
	let disabled = await redis.getList(db, `${room}:disabledCommands`);
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

async function generateSettingsPage(room) {
	let enabledOptions = await redis.getList(db, `${room}:options`);
	let disabled = await redis.getList(db, `${room}:disabledCommands`);

	let options = [];
	Handler.chatHandler.options.forEach(val => {
		options.push({name: val, checked: enabledOptions.includes(val)});
	});

	let commands = Object.keys(Handler.chatHandler.commands).filter(cmd => !(Handler.chatHandler.commands[cmd].hidden || (Handler.chatHandler.commands[cmd].rooms && !Handler.chatHandler.commands[cmd].rooms.includes(room)))).map(val => ({name: val, checked: disabled.includes(val)}));

	return server.renderTemplate('settings', {room: room, options: options, commands: commands});
}

async function settingsResolver(req, res) {
	let split = req.url.split('/');
	let [room, query] = split[split.length - 1].split('?');
	if (!(room && room in Handler.chatHandler.settings)) return res.end(`Room '${room}' has no available settings.`);
	query = server.parseURL(req.url);
	let token = query.token;
	if (token) {
		let data = server.getAccessToken(token);
		if (!(data.room === room && data.permission === 'settings')) return res.end('Invalid access token.');
		if (req.method === "POST") {
			if (!(req.body && req.body.data)) return res.end("Malformed request.");
			let settings;
			try {
				settings = JSON.parse(decodeURIComponent(req.body.data));
			} catch (e) {
				return res.end("Malformed JSON.");
			}
			await changeSettings(room, settings);
		}
		return res.end(await generateSettingsPage(room));
	}
	return res.end('Please attach an access token. (You should get one when you type .settings)');
}

server.addRoute('/settings', settingsResolver);

module.exports = {
	commands: {
		settings: {
			hidden: true,
			action(message) {
				let room = this.room || message;
				if (!room) return;
				if (!(room in this.userlists)) return this.pmreply(`The bot isn't in the room '${room}'.`);
				if (!this.getRoomAuth(room)) return;
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (!this.settings[room]) this.settings[room] = {options: [], disabledCommands: []};

				if (Config.checkIps) {
					Handler.checkIp(this.userid, (userid, ips) => {
						let data = {room: room, permission: 'settings'};
						if (ips) data.ip = ips[0];
						let token = server.createAccessToken(data, 15);
						return this.pmreply(`Settings for room ${room}: ${server.url}settings/${room}?token=${token}`);
					});
				} else {
					let token = server.createAccessToken({room: room, permission: 'settings'}, 15);
					return this.pmreply(`Settings for room ${room}: ${server.url}settings/${room}?token=${token}`);
				}
			},
		},
	},
};
