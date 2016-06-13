var fs = require('fs');
var crypto = require('crypto');

module.exports = {
	commands: {
		eval: function(userstr, room, message) {
			if (Config.admins.indexOf(toId(userstr)) < 0) return;

			let ret;
			try {
				ret = JSON.stringify(eval(message));
				if (ret === undefined) ret = 'undefined';
			} catch (e) {
				ret = 'Failed to eval ' + message + ': ' + e.toString();
			} finally {
				return {reply: '' + ret};
			}
		},
		reload: function (userstr, room, message) {
			if (!canUse(userstr, 6)) return {pmreply: "Permission denied."};

			switch (message) {
			case 'data':
				Databases.reloadDatabases();
				return {reply: "Data reloaded successfully."};
			case 'config':
				delete require.cache[require.resolve('../config.js')];
				Config = require('../config.js');
				return {reply: "Config reloaded successfully."};
			case 'server':
				Server.restart();
				break;
			default:
				return {pmreply: "Invalid option."};
			}
		},
		console: function(userstr) {
			if (!canUse(userstr, 6)) return {pmreply: "Permission denied."};

			var fname = crypto.randomBytes(10).toString('hex');
			var path = './public/' + fname + '.txt';
			fs.writeFileSync(path, stdout);
			setTimeout(() => fs.unlinkSync(path), 10 * 60 * 1000);
			return {pmreply: 'Console output saved as ' + Server.url + fname + '.txt'};
		},
		set: function(userstr, room, message) {
			if (!canUse(userstr, 5)) return {pmreply: "Permission denied."};
			if (!room) return {pmreply: "This command can't be used in PMs."};

			var params = message.split(',').map(param => toId(param));
			if (!(params[0] in Commands)) return {pmreply: "Invalid command."};

			if (params.length < 2) return {reply: "This command is currently turned " + (Settings[room] ? (Settings[room][params[0]] || 'on') : 'on') + '.'};

			if (!Settings[room]) {
				Settings[room] = {};
			}

			switch (params[1]) {
			case 'on':
			case 'true':
			case 'yes':
			case 'enable':
				delete Settings[room][params[0]];
				break;
			case 'off':
			case 'false':
			case 'no':
			case 'disable':
				Settings[room][params[0]] = 'off';
				break;
			default:
				return {pmreply: "Invalid value. Use 'on' or 'off'."};
			}

			Databases.writeDatabase('settings');
			return {reply: "Usage of " + params[0] + " was turned " + (Settings[room][params[0]] ? 'off': 'on') + '.'};
		},
		leave: function(userstr, room) {
			if (!canUse(userstr, 5)) return {pmreply: "Permission denied."};
			if (!room) return {pmreply: "This command can't be used in PMs."};

			if (Settings.toJoin && Settings.toJoin.indexOf(room) > -1) {
				Settings.toJoin.splice(Settings.toJoin.indexOf(room), 1);
				Databases.writeDatabase('settings');
			}

			return {reply: '/leave'};
		}
	}
};
