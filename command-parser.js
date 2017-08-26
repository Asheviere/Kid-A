'use strict';

const fs = require('fs');

const server = require('./server.js');
const redis = require('./redis.js');

const analytics = redis.useDatabase('analytics');

const COMMAND_TOKEN = Config.commandSymbol || '.';
const COMMAND_REGEX = new RegExp(`^${".^$*+?()[{\\|-]".includes(COMMAND_TOKEN) ? '\\' : ''}${COMMAND_TOKEN}[\\w]+\\b`, "ig");

const dataCache = {};

function sendPM(userid, message) {
	Connection.send(`|/pm ${userid}, ${message}`);
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
	constructor(userlists, settings, commands, options) {
		this.userlists = userlists;
		this.data = analytics;
		this.settings = settings;
		this.commands = commands;
		this.options = options;

		this.canUse = permission => canUse(permission, this.userid, this.auth);
	}

	async run(cmd, userstr, room, message) {
		this.auth = userstr[0];
		this.username = userstr.substr(1);
		this.userid = toId(userstr);
		this.room = room;
		let command = this.commands[cmd];

		if (command.permission && !this.canUse(command.permission)) return this.pmreply("Permission denied.");
		if (command.disallowPM && !room) return this.pmreply("This command cannot be used in PMs.");
		if (room && room.includes('groupchat') && !command.allowGroupchats) return this.pmreply("This command cannot be used in groupchats.");
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

class AnalyzerWrapper {
	constructor(userlists, settings, options) {
		this.userlists = userlists;
		this.data = analytics;
		this.settings = settings;
		this.options = options;

		this.canUse = permission => canUse(permission, this.userid, this.auth);
	}

	async display(analyzer, room) {
		if (analyzer.rooms && !(analyzer.rooms.includes(room))) return;

		return await analyzer.display.apply(this, [room]);
	}

	async run(analyzer, userstr, room, message) {
		if (analyzer.rooms && !(analyzer.rooms.includes(room))) return;

		if (userstr) {
			if (!analyzer.parser) return;
			this.auth = userstr[0];
			this.username = userstr.substr(1);
			this.userid = toId(userstr);
			this.room = room;

			analyzer.parser.apply(this, [message]);
		} else {
			if (!analyzer.modnoteParser) return;
			this.room = room;

			analyzer.modnoteParser.apply(this, [message]);		
		}
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
		this.commandQueue = [];
		this.parsing = false;

		this.dataResolver = async (req, res) => {
			let room = req.originalUrl.split('/')[1];
			if (Handler.privateRooms.has(room)) {
				let query = server.parseURL(req.url);
				let token = query.token;
				if (!token) return res.end('Private room data requires an access token to be viewed.');
				let data = server.getAccessToken(token);
				if (!data) return res.end('Invalid access token.');
				if (data[room]) {
					res.end(await this.generateDataPage(room));
				} else {
					res.end('Permission denied.');
				}
			} else {
				res.end(await this.generateDataPage(room));
			}
		};

		this.generateDataPage = async room => {
			if (!dataCache[room]) {
				dataCache[room] = new Promise(async resolve => {
					let content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" type="text/css" href="../style.css"><title>${room} - Kid A</title><script src="https://d3js.org/d3.v4.min.js"></script><script src="../scripts/graphs.js"></script></head><body><div class="container">`;
					content += `<h1>${room} data:</h1><div class="quotes">`;
					let wrapper = new AnalyzerWrapper(this.userlists, this.settings, this.options);
					for (let i in this.analyzers) {
						if (this.analyzers[i].rooms && !this.analyzers[i].rooms.includes(room)) continue;
						if (this.analyzers[i].display) {
							content += '<div class="analyzer">';
							content += await wrapper.display(this.analyzers[i], room);
							content += '</div>';
						}
					}
					content += '</div></body></html>';
					setTimeout(() => delete dataCache[room], 1000 * 60 * 5);
					resolve(content);
				});
			}
			return dataCache[room];
		};

		let inits = [];

		fs.readdirSync('./plugins')
			.filter((file) => file.endsWith('.js') && !Config.blacklistedPlugins.has(file.slice(0, -3)))
			.forEach((file) => {
				let plugin = require('./plugins/' + file);
				let name = file.slice(0, -3);
				this.plugins[name] = plugin;
				if (plugin.init) inits.push(plugin.init());
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

		analytics.keys('*').then(keys => {
			let rooms = new Set();

			for (let i = 0; i < keys.length; i++) {
				let split = keys[i].split(':');
				if (split.length > 1) {
					let room = split[1];
					if (!rooms.has(room)) {
						rooms.add(room);
						server.addRoute(`/${room}/data`, this.dataResolver);
					}
				}
			}

			server.restart();
		});

		Promise.all(inits).then(() => server.restart());
	}

	async parse(userstr, room, message) {
		if (COMMAND_REGEX.test(message)) {
			if (this.parsing) {
				this.commandQueue.push([userstr, room, message]);
			} else {
				await this.parseCommand(userstr, room, message);
				if (this.commandQueue.length) {
					this.parseCommand.apply(this, this.commandQueue.splice(0, 1));
				} else {
					this.parsing = false;
				}
			}
		} else if (room) {
			if (!room.includes('groupchat')) this.analyze(userstr, room, message);
		} else {
			if (canUse(2, toId(userstr), userstr[0]) && message.startsWith('/invite')) {
				let toJoin = message.substr(8);

				let autojoin = await redis.getList(this.settings, 'autojoin');

				if (!(Config.rooms.includes(toJoin) || (autojoin && autojoin.includes(toJoin)))) {
					if (toJoin.includes('groupchat')) return Connection.send(`|/pm ${userstr.substr[1]}, Kid A is currently unsupported in groupchats.`);
					this.settings.rpush('autojoin', toJoin);
					Connection.send(`|/join ${toJoin}`);
					Connection.send(`|/pm ${userstr.substr[1]}, For an introduction on how to use Kid A in your room, see ${server.url}intro.html`);
					return;
				}
			}
			pmMsg('PM from ' + (userstr[0] === ' ' ? userstr.substr(1) : userstr) + ': ' + message);
			sendPM(userstr, "Hi I'm a chatbot made by bumbadadabum. I moderate rooms, provide chat analytics, and have a few other neat features. For help with using the bot, use ``.help`` for a list of available topics.");
		}
	}

	async parseModnote(room, message) {
		this.analyze(null, room, message);
	}

	async analyze(userstr, room, message) {
		let restartNeeded = !(await analytics.keys(`*:${room}`)).length;
		let wrapper = new AnalyzerWrapper(this.userlists, this.settings, this.options);
		for (let i in this.analyzers) {
			wrapper.run(this.analyzers[i], userstr, room, message);
		}
		restartNeeded = restartNeeded && (await analytics.keys(`*:${room}`)).length;
		if (restartNeeded) {
			server.addRoute(`/${room}/data`, this.dataResolver);
			server.restart();
		}
	}

	async parseCommand(userstr, room, message) {
		this.parsing = true;
		const username = userstr.substr(1);

		const words = message.split(' ');
		const cmd = words.splice(0, 1)[0].substr(1);
		if (!(cmd in this.commands)) {
			if (room) return;
			return sendPM(username, 'Invalid command.');
		}

		let disabled = await redis.getList(this.settings, `${room}:disabledCommands`);
		if (disabled && disabled.includes(cmd)) return;

		const wrapper = new CommandWrapper(this.userlists, this.settings, this.commands, this.options);

		let user = (!room && userstr[0] === ' ' ? '+' : userstr[0]) + username;
		await wrapper.run(cmd, user, room, words.join(' '));
	}

	async parseJoin(user, room) {
		for (let i in this.plugins) {
			if (this.plugins[i].onUserJoin && (!this.plugins[i].onUserJoin.rooms || this.plugins[i].onUserJoin.rooms.includes(room))) {
				this.plugins[i].onUserJoin.action.apply(this, [user, room]);
			}
		}
	}
}

module.exports = {
	new(userlists, settings) {
		return new ChatHandler(userlists, settings);
	},
};

