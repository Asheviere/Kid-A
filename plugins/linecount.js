'use strict';

const server = require('../server.js');
const Page = require('../page.js');

let leftpad = val => (val < 10 ? `0${val}`: `${val}`);

const linecountPage = new Page('linecount', linecountGenerator, 'linecount.html', {token: 'linecount'});
const topuserPage = new Page('topusers', topuserGenerator, 'topusers.html', {token: 'linecount'});

async function linecountGenerator(room, query) {
	let user = query.user;
	if (!user) return 'No user specified.';

	let linecount = await ChatLogger.getLineCount(room, toId(user));
	let keys = Object.keys(linecount);

	// Fill up gaps
	let today = new Date();
	let dayCounter;
	let monthCounter;
	let i = 1;
	do {
		let newDay = new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i);
		dayCounter = newDay.getUTCDate();
		monthCounter = newDay.getUTCMonth();
		let newKey = `${leftpad(newDay.getUTCDate())}/${leftpad(newDay.getUTCMonth() + 1)}`;
		if (!keys.includes(newKey)) keys.unshift(newKey);
		i++;
	} while (dayCounter !== today.getUTCDate() && !(monthCounter !== today.getUTCMonth() && dayCounter < today.getUTCDate()));

	keys.sort((a, b) => {
		let [day1, month1] = a.split('/').map(val => parseInt(val));
		let [day2, month2] = b.split('/').map(val => parseInt(val));
		if (month1 === 12 && month2 === 1) return -1;
		if (month1 === 1 && month2 === 12) return 1;
		if (month1 > month2) return 1;
		if (month2 > month1) return -1;
		if (day1 > day2) return 1;
		return -1;
	});
	let lcdata = keys.map(val => linecount[val] || 0);
	let total = lcdata.reduce((a, b) => a + b, 0);
	let seen = await ChatLogger.getLastSeen(user);
	return {room: room, user: user, total: total, dates: JSON.stringify(keys), data: JSON.stringify(lcdata), seen: seen};
}

async function topuserGenerator(room, query) {
	let option = toId(query.option || '');

	let options = {};
	let timeStr = " the past month";

	if (option === 'today') {
		options.day = true;
		timeStr = " today";
	} else if (option) {
		option = parseInt(option);
		if (!isNaN(option) && option > -1 && option < 24) {
			options.time = option;
			timeStr += ` at ${leftpad(option)}:00-${leftpad(option + 1)}:00 UTC`;
		}
	}

	let linecount = (await ChatLogger.getUserActivity(room, options)).slice(0, 50);

	if (!linecount.length) "No activity in this room";

	let keys = linecount.map(val => val[0]);
	let vals = linecount.map(val => val[1]);

	return {room: room, keys: JSON.stringify(keys), data: JSON.stringify(vals), timeStr: timeStr};
}

let curRooms = new Set();

module.exports = {
	async init() {
		let rooms = await ChatLogger.getRooms();

		for (let i = 0; i < rooms.length; i++) {
			curRooms.add(rooms[i]);
			linecountPage.addRoom(rooms[i]);
			topuserPage.addRoom(rooms[i]);
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

				if (!curRooms.has(room)) {
					linecountPage.addRoom(room);
					topuserPage.addRoom(room);
					server.restart();
					curRooms.add(room);
				}

				let url = linecountPage.getUrl(room, this.userid, true, {user: user});

				return this.pmreply(`Linecounts for ${user} in ${room}: ${url}`);
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
					if (!this.userlists[room] && !curRooms.has(room)) return this.reply(`Invalid room: ${room}`);
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

				let option = (options.day ? 'today' : null) || options.time;

				if (!curRooms.has(room)) {
					linecountPage.addRoom(room);
					topuserPage.addRoom(room);
					server.restart();
					curRooms.add(room);
				}

				const query = {};
				if (option) query.option = option;
				const url = topuserPage.getUrl(room, this.userid, true, query);

				return this.pmreply(`Most active chatters in ${room}: ${url}`);
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
