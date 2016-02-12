var request = require('request');
var fs = require('fs');

var actionUrl = 'http://play.pokemonshowdown.com/action.php';

// Load the data file.
var data;
try {
	data = JSON.parse(fs.readFileSync('./data/data.json'));
} catch (e) {}

if (!Object.isObject(data)) data = {};

global.Data = data;

// Load the analyzers.
var analyzers = {};
var files = fs.readdirSync('./analyzers');

for (var i = 0; i < files.length; i++) {
	analyzers[files[i].split('.')[0]] = require('./analyzers/' + files[i]);
}

module.exports = {
	analyzers: analyzers,

	writeData: function() {
		if (this.writePending) return false;

		if (this.writing) {
			this.writePending = true;
			return;
		}
		writing = true;
		var toWrite = JSON.stringify(Data);

		fs.writeFile('./data/data.json', toWrite, () => {
			this.writing = false;
			if (this.writePending) {
				this.writeData();
			}
		});
	},

	setup: function() {
		Connection.send('|/avatar ' + Config.avatar);

		var toJoin;

		if (Config.rooms.length > 11) {
			statusMsg("Due to spam protection, 11 is the max amount of rooms that can be joined at once.");
			toJoin = Config.rooms.slice(0,11);
		} else {
			toJoin = Config.rooms;
		}
		Connection.send('|/autojoin ' + toJoin.join(','));
	},

	parse: function(message) {
		if (!message) return;
		var split = message.split('|');
		if (!split[0]) split[0] = '>lobby'; // Zarel can't code

		switch (split[1]) {
			case 'challstr':
				statusMsg('Received challstr, logging in...');

				var challstr = split.slice(2).join('|');

				request.post(actionUrl, {headers : {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'act=login&name=' + Config.username + '&pass=' + Config.password + '&challstr=' + challstr},
					(error, response, body) => {
						if (!error && response.statusCode == 200) {
							if (body[0] === ']') {
								try {
									body = JSON.parse(body.substr(1));
								} catch (e) {}
								if (body.assertion && body.assertion[0] !== ';') {
									Connection.send('|/trn ' + Config.username + ',0,' + body.assertion);
								} else {
									forceQuit("Couldn't log in.");
								}
							} else {
								forceQuit("Incorrect request.");
							}
						}
					}
				);
				break;
			case 'updateuser':
				if (split[2] !== Config.username) return false;

				statusMsg("Logged in as " + split[2] + ". Setting up bot.");
				this.setup();
				statusMsg("Setup done.");
				break;
			case 'pm':
				if (toId(split[2]) === toId(Config.username)) return false;
				pmMsg("PM from " + split[2] + ": " + split[4]);

				Connection.send("|/reply Hi, I am a bot that is currently spying on everything you say in order to get his owner some fancy statistics. I don't have any cool commands so don't even try.");
				break;
			case 'c':
			case 'c:':
				this.analyze(split[0].substr(1).trim(), split[4]);
				break;
			case 'L':
			case 'l':
			case 'J':
			case 'j':
				var roomid = split[0].substr(1).trim();
				if (roomid in Config.lookoutList) {
					for (var i = 0; i < Config.lookoutList[roomid].length; i++) {
						if (toId(Config.lookoutList[roomid][i]) === toId(split[2])) {
							logMsg(Config.lookoutList[roomid][i] + (toId(split[1]) === 'j' ? "joined " : "left ") + roomid + ".");
						}
					}
				}
				break;
		}
	},

	analyze: function(room, message) {
		for (var i in this.analyzers) {
			if (!this.analyzers[i].rooms || this.analyzers[i].rooms.indexOf(room) > -1) {
				this.analyzers[i].parser(room, message);
			}
		}
	}
};
