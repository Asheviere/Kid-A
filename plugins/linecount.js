'use strict';

const server = require('../server.js');

server.addTemplate('linecount', 'linecount.html');

let leftpad = val => (val < 10 ? `0${val}`: `${val}`);

async function linecountResolver(req, res) {
	let room = req.originalUrl.split('/')[1];
	let query = server.parseURL(req.url);
	let token = query.token;
	let user = query.user;
	if (token) {
		let data = server.getAccessToken(token);
		if (!data || data.room !== room) return res.end('Invalid access token.');
		if (!user) return res.end('No user specified.');

		let linecount = await ChatLogger.getLineCount(room, toId(user));
		let keys = Object.keys(linecount);

		// Fill up gaps
		let today = new Date();
		let dayCounter;
		let i = 1;
		while (dayCounter !== today.getUTCDate()) {
			let newDay = new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i);
			dayCounter = newDay.getUTCDate();
			let newKey = `${leftpad(newDay.getUTCDate())}/${leftpad(newDay.getUTCMonth() + 1)}`;
			if (!keys.includes(newKey)) keys.push(newKey);
			i++;
		}

		keys.sort((a, b) => {
			let [day1, month1] = a.split('/').map(val => parseInt(val));
			let [day2, month2] = b.split('/').map(val => parseInt(val));
			if (month1 > month2) return 1;
			if (month2 > month1) return -1;
			if (day1 > day2) return 1;
			return -1;
		});
		let lcdata = keys.map(val => linecount[val] || 0);
		let total = lcdata.reduce((a, b) => a + b, 0);
		let seen = await ChatLogger.getLastSeen(user);
		return res.end(server.renderTemplate('linecount', {room: room, user: user, total: total, dates: JSON.stringify(keys), data: JSON.stringify(lcdata), seen: seen}));
	}
	return res.end('Please attach an access token. (You should get one when you type .linecount <room>, <user>)');
}

let curRooms = new Set();

module.exports = {
	async init() {
		let rooms = await ChatLogger.getRooms();

		for (let i = 0; i < rooms.length; i++) {
			curRooms.add(rooms[i]);
			server.addRoute(`/${rooms[i]}/linecount`, linecountResolver);
		}
	},
	commands: {
		linecount: {
			async action(message) {
				let room = this.room;
				let user;
				if (!room) {
					let split = message.split(',');
					[room, user] = split.map(param => param.trim());
					if (!(room && user)) return this.pmreply("Syntax: ``.linecount room, user``");
					if (!this.userlists[room] && !curRooms.has(room)) return this.reply(`Invalid room: ${room}`);
					if (!this.getRoomAuth(room)) return;
				} else {
					user = message;
					if (!(user)) return this.pmreply("Syntax: ``.linecount user``");
				}

				if (!(this.canUse(3))) return this.pmreply("Permission denied.");

				let fname = `${room}/linecount`;

				let data = {};
				data.room = room;
				let token = server.createAccessToken(data, 15);
				fname += `?token=${token}&user=${toId(user)}`;

				if (!curRooms.has(room)) {
					server.addRoute(`/${room}/linecount`, linecountResolver);
					server.restart();
					curRooms.add(room);
				}

				return this.reply(`Linecounts for ${user} in ${room}: ${server.url}${fname}`);
			},
		},
		topusers: {
			async action(message) {
				let room = this.room;
				let options = {};

				let split = message.split(',').map(param => toId(param));

				if (!room) {
					room = split.shift();
					if (!room) return this.pmreply("Syntax: ``.topusers room``");
					if (!this.getRoomAuth(room)) return;
				}

				for (let i = 0; i < split.length; i++) {
					if (split[i] === 'day' || split[i] === 'today') {
						options.day = true;
					}

					let hour = parseInt(split[i]);

					if (!isNaN(hour) && hour >= 0 && hour < 24) {
						options.time = hour;
					}
				}

				if (!(this.canUse(3))) return this.pmreply("Permission denied.");

				let linecount = await ChatLogger.getUserActivity(room, options);

				if (!linecount.length) return this.reply("This room has no activity.");

				return this.reply(`Top 5 most active chatters in ${room}${options.day ? ' today' : ''}${'time' in options ? ` from ${options.time}:00 to ${options.time + 1}:00` : ''}: ${linecount.slice(0, 5).map(val => `${val[0]} (${val[1]})`).join(', ')}`);
			},
		},
	},
	analyzer: {
		async display(room) {
			let linecount = await ChatLogger.getRoomActivity(room);
			let labels = [];
			let data = [];
			let idx = 0;
			for (let i = 0; i < 24; i++) {
				if (idx < linecount.length && parseInt(linecount[idx][0]) === i) {
					data.push(linecount[idx][1] / 30);
					idx++;
				} else {
					data.push(0);
				}
				labels.push(i);
			}
			output = `<h3>Average lines of chat per hour of the day (Times are GMT):</h3><div id="activity"></div>`;
			output += `<script>createBarGraph(${JSON.stringify(labels)}, ${JSON.stringify(data)}, '#activity', 10)</script>`;
			output += `<h3>Total number of unique users in the past 30 days: <u>${await ChatLogger.getUniqueUsers(room)}</u></h3>`;

			return output;
		},
	},
};
