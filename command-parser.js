'use strict';

const fs = require('fs');

const server = require('./server.js');
const databases = require('./databases.js');


function sendPM(userid, message) {
	Connection.send('|/pm ' + userid + ', ' + message);
}

function canUse(permission, userid, auth) {
	if (Config.admins.has(userid)) return true;
	switch (auth) {
	case '~':
		return (permission < 7);
	case '#':
	case '&':
		return (permission < 6);
	case '@':
		return (permission < 5);
	case '%':
		return (permission < 4);
	case '+':
		return (permission < 2);
	default:
		return !permission;
	}
}

class CommandWrapper {
	constructor(userlists, data, settings, commands, options) {
		this.userlists = userlists;
		this.data = data;
		this.settings = settings;
		this.commands = commands;
		this.options = options;

		this.canUse = permission => canUse(permission, this.userid, this.auth);
	}

	run(cmd, userstr, room, message) {
		this.auth = userstr[0];
		this.username = userstr.substr(1);
		this.userid = toId(userstr);
		this.room = room;
		let command = this.commands[cmd];

		if (command.permission && !this.canUse(command.permission)) return this.pmreply("Permission denied.");
		if (command.disallowPM && !room) return this.pmreply("This command cannot be used in PMs.");
		if (room && command.rooms && !command.rooms.includes(room)) return;

		command.action.apply(this, [message]);
	}

	reply(message) {
		if (!this.room) {
			return this.pmreply(message);
		}
		Connection.send(this.room + '|' + message.replace(/trigger/g, 't⁠igger'));
	}

	pmreply(message) {
		sendPM(this.userid, message);
	}

	getRoomAuth(room) {
		if (this.userlists[room]) {
			if (this.userid in this.userlists[room]) {
				[this.auth, this.username] = this.userlists[room][this.userid];
				return true;
			}
			this.reply(`You need to be in the ${room} room to use this command.`);
			return false;
		}
		errorMsg(`Someone tried to use a ${room} room command without the bot being in the ${room} room. Either make the bot join ${room}, or remove the command.`);
		this.reply("Something went wrong! The bot's owner has been notified.");
		return false;
	}
}

class ChatHandler {
	constructor(userlists, settings) {
		this.plugins = {};
		this.analyzers = {};
		this.commands = {};
		this.options = new Set();
		this.userlists = userlists;
		this.settings = settings;

		let loadData = () => {
			let data;
			try {
				data = require('./data/data.json');
			} catch (e) {}

			if (typeof data !== 'object' || Array.isArray(data)) data = {};

			return data;
		};

		let writeData = () => {
			let toWrite = JSON.stringify(this.data);

			fs.writeFileSync('./data/data.json', toWrite);
		};

		databases.addDatabase('data', loadData, writeData);
		this.data = databases.getDatabase('data');

		fs.readdirSync('./plugins')
			.filter((file) => file.endsWith('.js') && !Config.blacklistedPlugins.has(file.slice(0, -3)))
			.forEach((file) => {
				let plugin = require('./plugins/' + file);
				let name = file.slice(0, -3);
				this.plugins[name] = plugin;
				if (plugin.analyzer) this.analyzers[name] = plugin.analyzer;
				if (plugin.commands) {
					Object.keys(plugin.commands).forEach((c) => {
						this.commands[c] = plugin.commands[c];
					});
				}
				if (plugin.options) {
					plugin.options.forEach((o) => {
						this.options.add(o);
					});
				}
			});

		let dataResolver = (req, res) => {
			let room = req.originalUrl.split('/')[1];
			if (Config.privateRooms.has(room)) {
				let query = server.parseURL(req.url);
				let token = query.token;
				if (!token) return res.end('Private room data requires an access token to be viewed.');
				let data = server.getAccessToken(token);
				if (!data) return res.end('Invalid access token.');
				if (data[room]) {
					res.end(this.generateDataPage(room));
				} else {
					res.end('Permission denied.');
				}
			} else {
				res.end(this.generateDataPage(room));
			}
		};

		for (let room in this.data) {
			server.addRoute('/' + room + '/data', dataResolver);
		}
	}

	parse(userstr, room, message) {
		if (message[0] === '.') {
			this.parseCommand(userstr, room, message);
		} else if (room) {
			this.analyze(userstr, room, message);
		} else {
			if (canUse(2, toId(userstr), userstr[0]) && message.startsWith('/invite')) {
				let toJoin = message.substr(8);
				if (!(Config.rooms.includes(toJoin) || (this.settings.toJoin && this.settings.toJoin.includes(toJoin)))) {
					if (!this.settings.toJoin) this.settings.toJoin = [];
					this.settings.toJoin.push(toJoin);
					Connection.send('|/join ' + toJoin);
					return databases.writeDatabase('settings');
				}
			}
			pmMsg('PM from ' + (userstr[0] === ' ' ? userstr.substr(1) : userstr) + ': ' + message);
			sendPM(userstr, "Hi I'm a chatbot made by bumbadadabum. I moderate rooms, provide chat analytics, and have a few other neat features. For help with using the bot, use ``.help`` for a list of available topics.");
		}
	}

	analyze(userstr, room, message) {
		for (let i in this.analyzers) {
			let analyzer = this.analyzers[i];
			if (!analyzer.rooms || analyzer.rooms.includes(room)) {
				analyzer.parser(room, message, userstr);
			}
		}
		databases.writeDatabase('data');
	}

	parseCommand(userstr, room, message) {
		const username = userstr.substr(1);

		const words = message.split(' ');
		const cmd = words.splice(0, 1)[0].substr(1);
		if (!(cmd in this.commands)) {
			if (room) return;
			return sendPM(username, 'Invalid command.');
		}

		const wrapper = new CommandWrapper(this.userlists, this.data, this.settings, this.commands, this.options);

		let user = (!room && userstr[0] === ' ' ? '+' : userstr[0]) + username;
		if (this.settings[room] && this.settings[room].disabledCommands.includes(cmd)) return;
		wrapper.run(cmd, user, room, words.join(' '));
	}

	parseJoin(user, room) {
		for (let i in this.plugins) {
			if (this.plugins[i].onUserJoin && (!this.plugins[i].onUserJoin.rooms || this.plugins[i].onUserJoin.rooms.includes(room))) {
				this.plugins[i].onUserJoin.action.apply(this, [user, room]);
			}
		}
	}

	generateDataPage(room) {
		let content = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" type="text/css" href="../style.css"><title>' + room + ' - Kid A</title></head><body><div class="container">';
		content += "<h1>" + room + ' data:</h1><div class="quotes">';
		for (let i in this.analyzers) {
			content += '<div class="analyzer">';
			if (this.analyzers[i].display && (!this.analyzers[i].rooms || this.analyzers[i].rooms.includes(room))) {
				content += this.analyzers[i].display(room);
			}
			content += '</div>';
		}
		return content + '</div></body></html>';
	}
}

module.exports = {
	new(userlists, settings) {
		return new ChatHandler(userlists, settings);
	},
};
