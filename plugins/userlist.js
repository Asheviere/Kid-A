var fs = require('fs');

function loadUserlist () {
	var userlist;
	try {
		userlist = require('../data/userlist.json');
	} catch (e) {}

	if (typeof userlist !== 'object' || Array.isArray(userlist)) userlist = {};

	return userlist;
}

function writeUserlist() {
	var toWrite = JSON.stringify(Data.userlist);

	fs.writeFileSync('./data/userlist.json', toWrite);
}

Databases.addDatabase('userlist', loadUserlist, writeUserlist);

module.exports = {
	commands: {
		addinfo: function (userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};
			var params = message.split(',').map(param => param.trim());

			if (!params.length) return {pmreply: "No user supplied."};

			if (!Data.userlist[room]) Data.userlist[room] = {};

			var userid = toId(params[0]);
			var info = Data.userlist[room][userid] || {};

			for (var i = 1; i < params.length; i++) {
				var vals = params[i].split(':').map(param => param.trim());
				if (vals.length < 2) return {pmreply: "Syntax error."};

				info[toId(vals[0])] = vals[1];
			}

			Data.userlist[room][userid] = info;
			Databases.writeDatabase('userlist');
			return {reply: 'Info successfully added.'};
		},
		removeinfo: function (userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};
			var params = message.split(',').map(param => param.trim());

			if (!params.length) return {pmreply: "No user supplied."};

			var userid = toId(params[0]);

			if (!(Data.userlist[room] && Data.userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

			if (params.length === 1) {
				delete Data.userlist[room][userid];
				Databases.writeDatabase('userlist');
				return {reply: "User successfully deleted."};
			}

			for (var i = 1; i < params.length; i++) {
				var val = toId(params[i]);
				if (!(val in Data.userlist[room][userid])) return {pmreply: "Field not found: " + val};

				delete Data.userlist[room][userid][val];
				if (!Object.keys(Data.userlist[room][userid]).length) delete Data.userlist[room][userid];
			}

			Databases.writeDatabase('userlist');
			return {reply: "Info successfully deleted."};
		},
		info: function(userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			var params = message.split(',').map(param => param.trim());

			if (!params.length) params = [userstr.substr(1)];

			var userid = toId(params[0]);

			if (!(Data.userlist[room] && Data.userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

			if (params.length === 1) {
				var output = [];
				for (var i in Data.userlist[room][userid]) {
					output.push(i + ": " + Data.userlist[room][userid][i]);
				}
				return {reply: output.join(', ')};
			}

			var field = toId(params[1]);
			if (!(field in Data.userlist[room][userid])) return {pmreply: "Field not found."};

			return {reply: field + ": " + Data.userlist[room][userid][field]};
		}
	}
};
