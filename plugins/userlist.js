'use strict';

const fs = require('fs');

function loadUserlist () {
	let userlist;
	try {
		userlist = require('../data/userlist.json');
	} catch (e) {}

	if (typeof userlist !== 'object' || Array.isArray(userlist)) userlist = {};

	return userlist;
}

function writeUserlist() {
	let toWrite = JSON.stringify(Data.userlist);

	fs.writeFileSync('./data/userlist.json', toWrite);
}

Databases.addDatabase('userlist', loadUserlist, writeUserlist);

module.exports = {
	commands: {
		addinfo(userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};
			let params = message.split(',').map(param => param.trim());

			if (!params.length) return {pmreply: "No user supplied."};

			if (!Data.userlist[room]) Data.userlist[room] = {};

			let userid = toId(params[0]);
			let info = Data.userlist[room][userid] || {};

			for (let i = 1; i < params.length; i++) {
				let vals = params[i].split(':').map(param => param.trim());
				if (vals.length < 2) return {pmreply: "Syntax error."};

				info[toId(vals[0])] = vals[1];
			}

			Data.userlist[room][userid] = info;
			Databases.writeDatabase('userlist');
			return {reply: 'Info successfully added.'};
		},

		removeinfo(userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};
			let params = message.split(',').map(param => param.trim());

			if (!params.length) return {pmreply: "No user supplied."};

			let userid = toId(params[0]);

			if (!(Data.userlist[room] && Data.userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

			if (params.length === 1) {
				delete Data.userlist[room][userid];
				Databases.writeDatabase('userlist');
				return {reply: "User successfully deleted."};
			}

			for (let i = 1; i < params.length; i++) {
				let val = toId(params[i]);
				if (!(val in Data.userlist[room][userid])) return {pmreply: "Field not found: " + val};

				delete Data.userlist[room][userid][val];
				if (!Object.keys(Data.userlist[room][userid]).length) delete Data.userlist[room][userid];
			}

			Databases.writeDatabase('userlist');
			return {reply: "Info successfully deleted."};
		},

		info(userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			let params = message.split(',').map(param => param.trim());

			if (!params[0]) params = [userstr.substr(1)];

			let userid = toId(params[0]);

			if (!(Data.userlist[room] && Data.userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

			if (params.length === 1) {
				let output = [];
				for (let i in Data.userlist[room][userid]) {
					output.push(i + ": " + Data.userlist[room][userid][i]);
				}
				return {reply: output.join(', ')};
			}

			let field = toId(params[1]);
			if (!(field in Data.userlist[room][userid])) return {pmreply: "Field not found."};

			return {reply: field + ": " + Data.userlist[room][userid][field]};
		}
	}
};
