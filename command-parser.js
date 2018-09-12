'use strict';

const fs = require('fs');

const server = require('./server.js');
const Page = require('./page.js');
const redis = require('./redis.js');
const Cache = require('./cache.js');

const analytics = redis.useDatabase('analytics');

const COMMAND_TOKEN = Config.commandSymbol || '.';
const COMMAND_REGEX = new RegExp(`^${".^$*+?()[{\\|-]".includes(COMMAND_TOKEN) ? '\\' : ''}${COMMAND_TOKEN}[\\w]+\\b`, "i");
const MONTH = 31 * 24 * 60 * 60 * 1000;

const dataCache = {};

function sendPM(userid, message) {
	Connection.send(`|/pm ${userid}, ${message}`);
}

function canUse(permission, userid, auth, pm = false) {
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
	case '*':
		return (permission < 3);
	case '+':
		return (permission < 2);
	default:
		if (pm) return (permission < 2);
		return !permission;
	}
}

function toDurationString(number) {
	// TODO: replace by Intl.DurationFormat or equivalent when it becomes available (ECMA-402)
	// https://github.com/tc39/ecma402/issues/47
	const date = new Date(+number);
	const parts = [date.getUTCFullYear() - 1970, date.getUTCMonth(), date.getUTCDate() - 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
	const unitNames = ["second", "minute", "hour", "day", "month", "year"];
	const positiveIndex = parts.findIndex(elem => elem > 0);
	return parts.slice(positiveIndex).reverse().map((value, index) => value ? `${value} ${unitNames[index]}${value > 1 ? 's' : ''}` : "").reverse().join(" ").trim();
}

class CommandWrapper {
	constructor(userlists, settings, commands, sendMail) {
		this.userlists = userlists;
		this.data = analytics;
		this.settings = settings;
		this.commands = commands;
		this.sendMail = sendMail;

		this.canUse = permission => canUse(permission, this.userid, this.auth, !this.room);
	}

	async run(cmd, userstr, room, message) {
		this.auth = userstr[0];
		this.username = userstr.substr(1);
		this.userid = toId(userstr);
		this.room = room;
		this.options = await this.settings.lrange(`${room}:options`, 0, -1);
		let command = this.commands[cmd];

		if (command.permission && !this.canUse(command.permission)) return this.pmreply("Permission denied.");
		if (command.disallowPM && !room) return this.pmreply("This command cannot be used in PMs.");
		if (room && room.includes('groupchat') && !command.allowGroupchats) return this.pmreply("This command cannot be used in groupchats.");
		if (room && command.rooms && !command.rooms.includes(room)) return;

		command.action.apply(this, [message]).catch(err => Output.errorMsg(err, 'Error in Command', {user: this.username, room: this.room}));
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
		Debug.log(2, `Someone tried to use a ${room} room command without the bot being in the ${room} room. Either make the bot join ${room}, or remove the command.`);
		this.reply("Tried to use a command for a room the bot isn't in! PANIC");
		return false;
	}
}

class AnalyzerWrapper {
	constructor(userlists, settings) {
		this.userlists = userlists;
		this.data = analytics;
		this.settings = settings;

		this.canUse = permission => canUse(permission, this.userid, this.auth);
	}

	async display(analyzer, room) {
		if (analyzer.rooms && !(analyzer.rooms.includes(room))) return;

		return await analyzer.display.apply(this, [room]);
	}

	async run(analyzer, userstr, room, message, options) {
		this.options = options;

		if (analyzer.rooms && !(analyzer.rooms.includes(room))) return;

		if (!userstr) {
			if (!analyzer.modnoteParser) return;
			this.room = room;

			analyzer.modnoteParser.apply(this, [message]);
		} else {
			if (!analyzer.parser) return;
			this.auth = userstr[0];
			this.username = userstr.substr(1);
			this.userid = toId(userstr);
			this.room = room;

			analyzer.parser.apply(this, [message]).catch(err => Output.errorMsg(err, 'Error in analyzer', {user: this.username, room: this.room}));
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
		this.mail = new Cache('mail');

		this.dataResolver = async (req, res) => {
			let room = req.originalUrl.split('/')[1];
			if (Handler.privateRooms.has(room)) {
				let query = Page.parseURL(req.url);
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

		// Prune mail scheduled over a month ago.
		for (let [curUser, messages] of Object.entries(this.mail.data)) {
			messages = messages.filter(({time}) => Date.now() - time < MONTH);
			if (messages) {
				this.mail.set(curUser, messages);
			} else {
				delete this.mail.data[curUser];
			}
		}
		this.mail.write();

		Promise.all(inits).then(() => server.restart());
	}

	async parse(userstr, room, message) {
		if (COMMAND_REGEX.test(message)) {
			this.parseCommand(userstr, room, message);
		} else if (room) {
			if (!room.includes('groupchat')) this.analyze(userstr, room, message);
		} else {
			if (canUse(2, toId(userstr), userstr[0]) && message.startsWith('/invite')) {
				let toJoin = message.substr(8);

				let autojoin = await this.settings.lrange('autojoin', 0, -1);

				if (!(Config.rooms.includes(toJoin) || (autojoin && autojoin.includes(toJoin)))) {
					if (toJoin.includes('groupchat')) return Connection.send(`|/pm ${userstr.substr[1]}, Kid A is currently unsupported in groupchats.`);
					this.settings.rpush('autojoin', toJoin);
					Connection.send(`|/join ${toJoin}`);
					Connection.send(`|/pm ${userstr.substr[1]}, For an introduction on how to use Kid A in your room, see ${server.url}intro.html`);
					return;
				}
			}
			if (message.startsWith('/') || message.startsWith('!')) return;
			Output.log('pm', 'PM from ' + (userstr[0] === ' ' ? userstr.substr(1) : userstr) + ': ' + message);
			sendPM(userstr, "Hi I'm a chatbot made by bumbadadabum. I moderate rooms, provide chat analytics, and have a few other neat features. For help with using the bot, use ``.help`` for a list of available topics.");
		}
	}

	async parseModnote(room, message) {
		this.analyze(null, room, message);
	}

	async analyze(userstr, room, message) {
		let wrapper = new AnalyzerWrapper(this.userlists, this.settings);
		let options = await this.settings.lrange(`${room}:options`, 0, -1);

		for (let i in this.analyzers) {
			wrapper.run(this.analyzers[i], userstr, room, message, options);
		}
	}

	async parseCommand(userstr, room, message) {
		if (this.parsing) {
			this.commandQueue.push([userstr, room, message]);
			return;
		}
		this.parsing = true;
		const username = userstr.substr(1);

		const words = message.split(' ');
		const cmd = words.splice(0, 1)[0].substr(1);
		if (!(cmd in this.commands)) {
			if (this.commandQueue.length) {
				this.parseCommand.apply(this, this.commandQueue.splice(0, 1));
			} else {
				this.parsing = false;
			}
			if (room) return;
			return sendPM(username, 'Invalid command.');
		}

		let disabled = await this.settings.lrange(`${room}:disabledCommands`, 0, -1);
		if (!(disabled && disabled.includes(cmd))) {
			const wrapper = new CommandWrapper(this.userlists, this.settings, this.commands, this.sendMail.bind(this));

			await wrapper.run(cmd, userstr, room, words.join(' '));
		}

		if (this.commandQueue.length) {
			this.parseCommand.apply(this, this.commandQueue.splice(0, 1));
		} else {
			this.parsing = false;
		}
	}

	async parseJoin(user, room) {
		// Send mail
		const userid = toId(user);
		let inbox = this.mail.get(userid);
		if (Array.isArray(inbox)) {
			for (let {sender, message, time} of inbox) {
				Connection.send(`|/pm ${userid}, [${toDurationString(Date.now() - time)} ago] **${sender}**: ${message}`);
			}
			delete this.mail.data[userid];
			this.mail.write();
		}

		for (let i in this.plugins) {
			if (this.plugins[i].onUserJoin && (!this.plugins[i].onUserJoin.rooms || this.plugins[i].onUserJoin.rooms.includes(room))) {
				this.plugins[i].onUserJoin.action.apply(this, [user, room]).catch(err => Output.errorMsg(err, 'Error in userJoin', {user: user, room: room}));
			}
		}
	}

	async parseTourCommand(roomid, command, rest) {
		switch (command) {
		case 'end':
			const data = JSON.parse(rest);
			for (let i in this.plugins) {
				if (this.plugins[i].onTourEnd && (!this.plugins[i].onTourEnd.rooms || this.plugins[i].onTourEnd.rooms.includes(roomid))) {
					this.plugins[i].onTourEnd.action.apply(this, [roomid, data]).catch(err => Output.errorMsg(err, 'Error in tour End', {data: data, room: roomid}));
				}
			}
		default:
			// Eventually I plan to make handlers for every single tour command, however that's currently not necessary with Kid A's tour features.
			return;
		}
	}

	sendMail(sender, target, message) {
		let inbox = this.mail.get(target);
		if (!Array.isArray(inbox)) inbox = [];
		if (inbox.length >= 5) return false;
		this.mail.set(target, inbox.concat({sender: sender, message: message, time: Date.now()}));
		this.mail.write();
		return true;
	}

	setupREPL() {
		const readline = require('readline');

		const repl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		repl.setPrompt(`${Config.username}> `);

		repl.prompt();
		repl.on('line', input => {
			// Only command currently supported is /send, allowing you to send messages from the bot.
			if (input.startsWith('/send ')) {
				Connection.send(input.slice(6));
			} else {
				let ret;
				try {
					ret = JSON.stringify(eval.bind(Handler.chatHandler)(input));
					if (ret === undefined) return;
					console.log(ret);
				} catch (e) {
					Output.errorMsg(e, 'Failed to eval:');
				}
			}
			repl.prompt();
		});
	}
}

module.exports = {
	new(userlists, settings) {
		return new ChatHandler(userlists, settings);
	},
};

