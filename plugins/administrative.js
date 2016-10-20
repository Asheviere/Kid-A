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
					let data = {console: true};
					if (ips) data.ip = ips[0];
					let token = server.createAccessToken(data, 15);
					return this.pmreply(`Console output: ${server.url}console?token=${token}`);
				});
			} else {
				let token = server.createAccessToken({console: true}, 15);
				return this.pmreply(`Console output: ${server.url}console?token=${token}`);
			}
		},

		leave() {
			if (!this.canUse(5)) return this.pmreply("Permission denied.");
			if (!this.room) return this.pmreply("This command can't be used in PMs.");

			if (this.settings.toJoin && this.settings.toJoin.includes(this.room)) {
				this.settings.toJoin.splice(this.settings.toJoin.indexOf(this.room), 1);
				databases.writeDatabase('settings');
			}

			return this.reply('/part ' + this.room);
		},
	},
};
