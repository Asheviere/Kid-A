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
const THROTTLE_DELAY = 300;
const THROTTLE_BUFFER_LIMIT = 6;

const dataCache = {};

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
		this.pm = !room;
		let command = this.commands[cmd];

		if (command.requireRoom && this.pm) {
			let [roomid, ...rest] = message.split(',');
			roomid = toId(roomid);
			if (!roomid || !this.userlists[roomid]) return this.reply(`Invalid room supplied: ${roomid}`);
			this.room = roomid;
			if (!this.getRoomAuth(this.room)) return;
			message = rest.join(',').trim();
		}

		if (command.permission && !this.canUse(command.permission)) return this.pmreply("Permission denied.");
		if (command.disallowPM && this.pm) return this.pmreply("This command cannot be used in PMs.");
		if (this.room && this.room.includes('groupchat') && !command.allowGroupchats) return this.pmreply("This command cannot be used in groupchats.");
		if (this.room && command.rooms && !command.rooms.includes(this.room)) return;

		command.action.apply(this, [message]).catch(err => Output.errorMsg(err, 'Error in Command', {user: this.username, room: this.room}));
	}

	reply(message) {
		if (this.pm) {
			return this.pmreply(message);
		}
		global.ChatHandler.send(this.room, message);
	}

	pmreply(message) {
		global.ChatHandler.sendPM(this.userid, message);
	}

	replyHTML(html, pm = false) {
		pm = pm || this.pm;
		global.ChatHandler.send(this.room || '', `${pm ? `/pminfobox ${this.userid},` : '/addhtmlbox'} ${html}`);
	}

	getRoomAuth(room) {
		if (this.userlists[room]) {
			if (this.userid in this.userlists[room]) {
				[this.auth, this.username] = this.userlists[room][this.userid];
				return true;
			}
			if (this.auth !== ' ' && this.auth !== '+') return true;
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

	async run(analyzer, userstr, room, message, options, timestamp) {
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

			analyzer.parser.apply(this, [message, timestamp]).catch(err => Output.errorMsg(err, 'Error in analyzer', {user: this.username, room: this.room}));
		}
	}
}

class ChatHandler {
	constructor(userlists, settings) {
		this.plugins = {};
		this.analyzers = {};
		this.commands = {};
		this.options = new Set();
		this.optionLabels = new Map();
		this.userlists = userlists;
		this.settings = settings;
		this.commandQueue = [];
		this.parsing = false;
		this.mail = new Cache('mail');
		this.privateRooms = Config.privateRooms;
		this.pendingQueries = {};

		this.sendQueue = [];
		this.sendQueueTimer = setInterval(() => {
			this.processQueue();
		}, THROTTLE_DELAY);
		this.lastMessage = 0;
		this.throttled = 0;

		settings.lrange('privaterooms', 0, -1).then(prooms => {
			if (prooms) prooms.forEach(val => this.privateRooms.add(val));
		});

		this.dataResolver = async (req, res) => {
			let room = req.originalUrl.split('/')[1];
			if (this.privateRooms.has(room)) {
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
						if (plugin.commands[c].aliases) {
							for (const alias of plugin.commands[c].aliases) {
								this.commands[alias] = plugin.commands[c];
							}
						}
					});
				}
				if (plugin.options) {
					plugin.options.forEach(entry => {
						let id, label;
						if (typeof entry === 'string') {
							id = entry;
							label = entry;
						} else {
							[id, label] = entry;
						}
						this.options.add(id);
						this.optionLabels.set(id, label);
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

	async parse(userstr, room, message, timestamp) {
		if (userstr.startsWith('‽')) return; // I hate locked users
		if (COMMAND_REGEX.test(message)) {
			this.parseCommand(userstr, room, message);
		} else if (room) {
			if (!room.includes('groupchat')) this.analyze(userstr, room, message, timestamp * 1000 || Date.now());
		} else {
			if (canUse(2, toId(userstr), userstr[0]) && message.startsWith('/invite')) {
				let toJoin = message.substr(8);

				let autojoin = await this.settings.lrange('autojoin', 0, -1);

				if (!(Config.rooms.includes(toJoin) || (autojoin && autojoin.includes(toJoin)))) {
					if (toJoin.includes('groupchat')) return this.sendPM(userstr.substr[1], `Kid A is currently unsupported in groupchats.`);
					this.settings.rpush('autojoin', toJoin);
					this.sendPM(userstr.substr(1), `For an introduction on how to use Kid A in your room, see ${server.url}intro.html`);
				}
				this.send(null, `/join ${toJoin}`);
				return;
			}
			if (message.startsWith('/') || message.startsWith('!')) return;
			Output.log('pm', 'PM from ' + (userstr[0] === ' ' ? userstr.substr(1) : userstr) + ': ' + message);
			this.sendPM(userstr, "Hi I'm a chatbot made by bumbadadabum. I moderate rooms, provide chat analytics, and have a few other neat features. For help with using the bot, use ``.help`` for a list of available topics.");
		}
	}

	async parseModnote(room, message) {
		this.analyze(null, room, message);
	}

	async analyze(userstr, room, message, timestamp) {
		let wrapper = new AnalyzerWrapper(this.userlists, this.settings);
		let options = await this.settings.lrange(`${room}:options`, 0, -1);

		for (let i in this.analyzers) {
			wrapper.run(this.analyzers[i], userstr, room, message, options, timestamp);
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
			return this.sendPM(username, 'Invalid command.');
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
				this.sendPM(userid, `[${toDurationString(Date.now() - time)} ago] **${sender}**: ${message}`);
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
		const data = rest.startsWith('{') || rest.startsWith('[') ? JSON.parse(rest) : rest;
		for (let i in this.plugins) {
			if (this.plugins[i].tours && (!this.plugins[i].tours.rooms || this.plugins[i].tours.rooms.includes(roomid))) {
				const options = await this.settings.lrange(`${roomid}:options`, 0, -1);
				if (options.includes('disabletours')) return;
				this.plugins[i].tours.listener.emit(command, roomid, data);
			}
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
				let [room, ...message] = input.slice(6).split(',');
				this.send(toId(room), message.join(',').trim());
			} else {
				let ret;
				try {
					ret = JSON.stringify(eval.bind(this)(input));
					if (ret === undefined) return;
					console.log(ret);
				} catch (e) {
					Output.errorMsg(e, 'Failed to eval:');
				}
			}
			repl.prompt();
		});
		repl.on('close', () => {
			process.emit('SIGINT');
		});
	}

	trySend(message) {
		let now = Date.now();

		if (now < this.lastMessage + THROTTLE_DELAY) {
			this.sendQueue.push(message);
			Debug.log(3, `Pushing to queue {${this.sendQueue.length}}: ${message}`);
		} else {
			this.lastMessage = now;
			Connection.send(message);
		}
	}

	processQueue() {
		let now = Date.now();

		if (this.throttled) this.throttled--;
		while (this.throttled < THROTTLE_BUFFER_LIMIT - 1 && this.sendQueue.length) {
			const msg = this.sendQueue.shift();
			Connection.send(msg);
			this.throttled++;
			this.lastMessage = now;
			Debug.log(3, `Sending message from queue {${this.sendQueue.length}} PS has throttled ${this.throttled}: ${msg}`);
		}
	}

	sendPM(user, message) {
		this.trySend(`|/pm ${user}, ${message}`);
	}

	send(room, message) {
		Debug.log(4, `sending to ${room}: ${message}`);
		this.trySend(`${room || ''}|${message}`);
	}

	parseQueryResponse(id, response) {
		// failsafe
		if (!this.pendingQueries[id].length) return;
		this.pendingQueries[id].shift()(response);
	}

	async query(id, query) {
		let timer;
		const promise = new Promise((resolve, reject) => {
			Connection.send(`|/query ${id} ${query}`);
			if (!this.pendingQueries[id]) this.pendingQueries[id] = [];
			this.pendingQueries[id].push(resolve);
			timer = setTimeout(() => {
				this.pendingQueries[id] = this.pendingQueries[id].filter(val => val !== resolve);
				reject();
			}, 5 * 60 * 1000);
		});
		const res = await promise;
		clearTimeout(timer);
		return res;
	}
}

module.exports = {
	new(userlists, settings) {
		return new ChatHandler(userlists, settings);
	},
};

