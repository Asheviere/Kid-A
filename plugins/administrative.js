'use strict';

const databases = require('../databases.js');
const server = require('../server.js');

function parseConsole(req, res) {
	let query = server.parseURL(req.url);
	let token = query.token;
	if (!token) return res.end('Please attach an access token. (You should get one when you type .console)');
	let data = server.getAccessToken(token);
	if (!data) return res.end('Invalid access token.');
	if (data.console) {
		if (data.ip && req.ip !== data.ip) server.removeAccessToken(token);
		res.end(stdout);
	} else {
		res.end('Permission denied.');
	}
}

server.addRoute('/console', parseConsole);

module.exports = {
	commands: {
		eval(message) {
			if (!Config.admins.has(this.userid)) return;

			let ret;
			try {
				ret = JSON.stringify(eval(message));
				if (ret === undefined) ret = 'undefined';
			} catch (e) {
				ret = 'Failed to eval ' + message + ': ' + e.toString();
			}
			return this.reply('' + ret);
		},

		reload(message) {
			if (!this.canUse(6)) return this.pmreply("Permission denied.");

			switch (message) {
			case 'data':
				databases.reloadDatabases();
				return this.reply("Data reloaded successfully.");
			case 'config':
				delete require.cache[require.resolve('../config.js')];
				Config = require('../config.js');
				return this.reply("Config reloaded successfully.");
			case 'server':
				server.restart();
				return this.reply("Server restarted successfully.");
			default:
				return this.pmreply("Invalid option.");
			}
		},

		console() {
			if (!this.canUse(6)) return this.pmreply("Permission denied.");

			if (Config.checkIps) {
				Handler.checkIp(this.userid, (userid, ips) => {
					let token = server.createAccessToken({console: true, ip: ips[0]});
					return this.pmreply(`Console output: ${server.url}console?token=${token}`);
				});
			} else {
				let token = server.createAccessToken({console: true});
				return this.pmreply(`Console output: ${server.url}console?token=${token}`);
			}
		},

		set(message) {
			if (!this.canUse(5)) return this.pmreply("Permission denied.");
			if (!this.room) return this.pmreply("This command can't be used in PMs.");

			let params = message.split(',').map(param => toId(param));

			// Very dirty, but works for now. TODO: elegance.
			let type;
			if (params[0] in this.commands) {
				type = 'command';
			} else if (this.options.has(params[0])) {
				type = 'option';
			} else {
				return this.pmreply("Invalid command or option.");
			}

			if (params.length < 2) {
				if (type === 'command') return this.reply("Usage of the command " + params[0] + " is turned " + (this.settings[this.room] ? this.settings[this.room][params[1]] || 'on' : 'on') + '.');
				if (type === 'option') this.reply("The option " + params[0] + " is turned " + (this.settings[this.room] ? this.settings[this.room][params[1]] || 'off' : 'off') + '.');
			}

			if (!this.settings[this.room]) {
				this.settings[this.room] = {};
			}

			switch (params[1]) {
			case 'on':
			case 'true':
			case 'yes':
			case 'enable':
				if (type === 'command') {
					delete this.settings[this.room][params[0]];
				} else if (type === 'option') {
					this.settings[this.room][params[0]] = 'on';
				}
				break;
			case 'off':
			case 'false':
			case 'no':
			case 'disable':
				if (type === 'command') {
					this.settings[this.room][params[0]] = 'off';
				} else if (type === 'option') {
					delete this.settings[this.room][params[0]];
				}
				break;
			default:
				return this.pmreply("Invalid value. Use 'on' or 'off'.");
			}

			databases.writeDatabase('settings');
			return this.reply("The " + type + " '" + params[0] + "' was turned " + (this.settings[this.room][params[0]] ? this.settings[this.room][params[0]] : (type === 'command' ? 'on' : 'off')) + '.');
		},

		leave(userstr, room) {
			if (!this.canUse(5)) return this.pmreply("Permission denied.");
			if (!room) return this.pmreply("This command can't be used in PMs.");

			if (this.settings.toJoin && this.settings.toJoin.includes(room)) {
				this.settings.toJoin.splice(this.settings.toJoin.indexOf(room), 1);
				databases.writeDatabase('settings');
			}

			return this.reply('/part ' + room);
		},
	},
};
