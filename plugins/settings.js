'use strict';

const server = require('../server.js');
const databases = require('../databases.js');

function changeSettings(room, settings) {
	let output = '';
	let changed = false;
	for (let key in settings) {
		if (key === 'token') continue;

		if (key in Handler.chatHandler.commands) {
			if (settings[key] === 'true') {
				if (!Handler.chatHandler.settings[room].disabledCommands.includes(key)) {
					Handler.chatHandler.settings[room].disabledCommands.push(key);
					changed = true;
				}
			} else {
				let idx = Handler.chatHandler.settings[room].disabledCommands.indexOf(key);
				if (idx > -1) {
					Handler.chatHandler.settings[room].disabledCommands.splice(idx, 1);
					changed = true;
				}
			}
		} else if (Handler.chatHandler.options.has(key)) {
			if (settings[key] === 'true') {
				if (!Handler.chatHandler.settings[room].options.includes(key)) {
					Handler.chatHandler.settings[room].options.push(key);
					changed = true;
				}
			} else {
				let idx = Handler.chatHandler.settings[room].options.indexOf(key);
				if (idx > -1) {
					Handler.chatHandler.settings[room].options.splice(idx, 1);
					changed = true;
				}
			}
		} else {
			if (!output) output += "Your query contained invalid settings:";
			output += " " + key;
		}
	}
	if (changed) databases.writeDatabase('settings');
	if (output) {
		if (changed) output += ". The rest of the query has been processed, and settings have been updated accordingly.";
	} else {
		output += "Settings updated successfully.";
	}
	return output;
}

function generateSettingsPage(room) {
	let content = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" type="text/css" href="../style.css"><title>' + room + ' - Kid A</title><script src="/scripts/settings.js"></script></head><body><div class="container">';

	if (Handler.chatHandler.options.size) {
		content += '<h2>Options</h2><table>';
		let i = 0;
		Handler.chatHandler.options.forEach(val => {
			if (i % 3 === 0) content += '<tr>';

			content += `<td><input type="checkbox" name="${val}" ${Handler.chatHandler.settings[room].options.includes(val) ? 'checked' : ''}>${val}</td>`;

			if (i % 3 === 2) content += '</tr>';
			i++;
		});
		content += '</table>';
	}

	content += '<h2>Disabled Commands</h2><table>';
	let keys = Object.keys(Handler.chatHandler.commands);
	for (let i = 0; i < keys.length; i++) {
		if (i % 3 === 0) content += '<tr>';

		content += `<td><input type="checkbox" name="${keys[i]}" ${Handler.chatHandler.settings[room].disabledCommands.includes(keys[i]) ? 'checked' : ''}>${keys[i]}</td>`;

		if (i % 3 === 2) content += '</tr>';
	}
	content += '</table><button onclick="submit()">Submit changes</button>';

	return content + '</div></body></html>';
}

function settingsResolver(req, res) {
	let split = req.url.split('/');
	let [room, query] = split[split.length - 1].split('?');
	if (!(room && room in Handler.chatHandler.settings)) return res.end(`Room '${room}' has no available settings.`);
	query = server.parseURL(req.url);
	let token = query.token;
	if (!token) return res.end('Please attach an access token. (You should get one when you type .console)');
	let data = server.getAccessToken(token);
	if (!data) return res.end('Invalid access token.');
	if (Object.keys(query).length > 1) {
		return res.end(changeSettings(room, query));
	}
	return res.end(generateSettingsPage(room));
}

server.addRoute('/settings', settingsResolver);

module.exports = {
	commands: {
		settings(message) {
			let room = this.room || message;
			if (!room) return;
			if (!(room in this.userlists)) return this.pmreply(`The bot isn't in the room '${this.room}'.`);
			if (!this.getRoomAuth(room)) return;
			if (!this.canUse(5)) return this.pmreply("Permission denied.");

			if (!this.settings[this.room]) this.settings[room] = {options: [], disabledCommands: []};

			if (Config.checkIps) {
				Handler.checkIp(this.userid, (userid, ips) => {
					let data = {room: room, auth: this.auth};
					if (ips) data.ip = ips[0];
					let token = server.createAccessToken(data, 15);
					return this.pmreply(`Settings for room ${room}: ${server.url}settings/${room}?token=${token}`);
				});
			} else {
				let token = server.createAccessToken({room: room, auth: this.auth}, 15);
				return this.pmreply(`Settings for room ${room}: ${server.url}settings/${room}?token=${token}`);
			}
		},
	},
};