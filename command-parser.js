'use strict';

const fs = require('fs');

const server = require('./server.js');
const databases = require('./databases.js');


function sendPM(userid, message) {
	Connection.send('|/w ' + userid + ', ' + message);
}

class CommandWrapper {
	constructor(userlists, data, settings, commands, options) {
		this.userlists = userlists;
		this.data = data;
		this.settings = settings;
		this.commands = commands;
		this.options = options;
	}

	run(cmd, userstr, room, message) {
		this.userid = toId(userstr);
		this.room = room;
		// I could refactor everything to enforce use of this.userstr and this.userid, but I'll keep this around for now, until I feel productive enough to refactor everything.
		cmd.apply(this, [userstr, room, message]);
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
}

class ChatHandler {
	constructor(userlists, settings) {
		let plugins = {};
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
				plugins[name] = plugin;
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
			res.end(this.generateDataPage(room));
		};

		for (let room in this.data) {
			if (Config.privateRooms.has(room)) continue;
			server.addRoute('/' + room + '/data', dataResolver);
		}
	}

	parse(userstr, room, message) {
		if (message[0] === '.') {
			this.parseCommand(userstr, room, message);
		} else if (room) {
			this.analyze(userstr, room, message);
		} else {
			if (canUse(userstr, 2) && message.startsWith('/invite')) {
				let toJoin = message.substr(8);
				if (!(Config.rooms.includes(toJoin) || (this.settings.toJoin && this.settings.toJoin.includes(toJoin)))) {
					if (!this.settings.toJoin) this.settings.toJoin = [];
					this.settings.toJoin.push(toJoin);
					Connection.send('|/join ' + toJoin);
					return databases.writeDatabase('settings');
				}
			}
			pmMsg('PM from ' + (userstr[0] === ' ' ? userstr.substr(1) : userstr) + ': ' + message);
			Connection.send("|/reply Hi I'm a chatbot made by bumbadadabum. I moderate rooms, provide chat analytics, and have a few other neat features. For help with using the bot, use ``.help`` for a list of available topics.");
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
			sendPM(username, 'Invalid command.');
		}

		const wrapper = new CommandWrapper(this.userlists, this.data, this.settings, this.commands, this.options);

		let user = (!room && userstr[0] === ' ' ? '+' : userstr[0]) + username;
		if (this.settings[room] && this.settings[room][cmd] === 'off') return;
		wrapper.run(this.commands[cmd], user, room, words.join(' '));
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
