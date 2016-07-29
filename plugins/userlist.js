'use strict';

const fs = require('fs');

const databases = require('../databases.js');

let userlistdata;

function loadUserlist() {
	let userlist;
	try {
		userlist = require('../data/userlist.json');
	} catch (e) {}

	if (typeof userlist !== 'object' || Array.isArray(userlist)) userlist = {};

	return userlist;
}

function writeUserlist() {
	let toWrite = JSON.stringify(userlistdata);

	fs.writeFileSync('./data/userlist.json', toWrite);
}

databases.addDatabase('userlist', loadUserlist, writeUserlist);
userlistdata = databases.getDatabase('userlist');

module.exports = {
	commands: {
		addinfo(userstr, room, message) {
			if (!room) return this.pmreply("This command can't be used in PMs.");
			if (!canUse(userstr, 2)) return this.pmreply("Permission denied.");
			let params = message.split(',').map(param => param.trim());

			if (!params.length) return this.reply("No user supplied.");

			if (!userlistdata[room]) userlistdata[room] = {};

			let userid = toId(params[0]);
			let info = userlistdata[room][userid] || {};

			for (let i = 1; i < params.length; i++) {
				let vals = params[i].split(':').map(param => param.trim());
				if (vals.length < 2) return this.pmreply("Syntax error.");

				info[toId(vals[0])] = vals[1];
			}

			userlistdata[room][userid] = info;
			databases.writeDatabase('userlist');
			return this.reply('Info successfully added.');
		},

		removeinfo(userstr, room, message) {
			if (!room) return this.pmreply("This command can't be used in PMs.");
			if (!canUse(userstr, 2)) return this.pmreply("Permission denied.");
			let params = message.split(',').map(param => param.trim());

			if (!params.length) return this.reply("No user supplied.");

			let userid = toId(params[0]);

			if (!(userlistdata[room] && userlistdata[room][userid])) return this.reply("User not found in this room's userlist.");

			if (params.length === 1) {
				delete userlistdata[room][userid];
				databases.writeDatabase('userlist');
				return this.reply("User successfully deleted.");
			}

			for (let i = 1; i < params.length; i++) {
				let val = toId(params[i]);
				if (!(val in userlistdata[room][userid])) return this.reply("Field not found: " + val);

				delete userlistdata[room][userid][val];
				if (!Object.keys(userlistdata[room][userid]).length) delete userlistdata[room][userid];
			}

			databases.writeDatabase('userlist');
			return this.reply("Info successfully deleted.");
		},

		info(userstr, room, message) {
			if (!room) return this.pmreply("This command can't be used in PMs.");
			let params = message.split(',').map(param => param.trim());

			if (!params[0]) params = [userstr.substr(1)];

			let userid = toId(params[0]);

			if (!(userlistdata[room] && userlistdata[room][userid])) return this.reply("User not found in this room's userlist.");

			if (params.length === 1) {
				let output = [];
				for (let i in userlistdata[room][userid]) {
					output.push(i + ": " + userlistdata[room][userid][i]);
				}
				return this.reply(output.join(', '));
			}

			let field = toId(params[1]);
			if (!(field in userlistdata[room][userid])) return this.reply("Field not found.");

			return this.reply(field + ": " + userlistdata[room][userid][field]);
		},
	},
};
