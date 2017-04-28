'use strict';

const redis = require('../redis.js');
const settings = redis.useDatabase('settings');

const HOUR = 1000 * 60 * 60;
const FIFTEEN_MINS = 1000 * 60 * 15;

function getPunishment(val) {
	switch (val) {
	case 1:
	case 2:
		return 'warn';
	case 3:
	case 4:
		return 'mute';
	case 5:
		return 'hourmute';
	default:
		return 'roomban';
	}
}

let mutes = new Set();
let mutedIps = new Set();
let punishments = new Map();

async function checkMuted(roomid, userid) {
	let thisid, ips;

	if (Config.checkIps) {
		[thisid, ips] = await Handler.checkIp(userid);
	} else {
		thisid = userid;
	}

	let muted = false;

	muted = mutes.has(`${roomid}:${thisid}`) || muted;
	mutes.add(`${roomid}:${thisid}`);
	setTimeout(() => mutes.delete(`${roomid}:${thisid}`), HOUR);

	if (Config.checkIps && ips) {
		for (let ip of ips) {
			muted = mutedIps.has(`${roomid}:${ip}`) || muted;
			mutedIps.add(`${roomid}:${ip}`);
			setTimeout(() => mutedIps.delete(`${roomid}:${ip}`), HOUR);
		}
	}

	return muted;
}

async function punish(username, room, val, msg) {
	let userid = toId(username);

	let points = punishments.has(`${room}:${userid}`) ? punishments.get(`${room}:${userid}`)[0] : 0;

	points += val;

	if (points >= 3 && (await checkMuted(room, userid))) {
		return Connection.send(`${room}|/rb ${userid}, Bot moderation: repeated offenses.`);
	}

	if (points === 1) {
		Connection.send(`${room}|${username}, ${msg}`);
	} else {
		Connection.send(`${room}|/${getPunishment(points)} ${userid}, Bot moderation: ${msg}`);
	}

	if (punishments.has(`${room}:${userid}`)) {
		clearTimeout(punishments.get(`${room}:${userid}`)[1]);
	}

	punishments.set(`${room}:${userid}`, [points, setTimeout(() => punishments.delete(`${room}:${userid}`), FIFTEEN_MINS)]);
}

let buffers = {};
let timers = {};

function addBuffer(userid, room, message) {
	if (!buffers[room]) buffers[room] = [];
	buffers[room].push([userid, message]);
	if (buffers[room].length > 7) buffers[room].splice(0, 1);
	if (timers[room]) clearTimeout(timers[room]);
	timers[room] = setTimeout(() => buffers[room] = [], 1000 * 3);
}

module.exports = {
	options: ['disablemoderation', 'allowbold', 'allowcaps', 'allowstretching', 'allowflooding'],

	analyzer: {
		async parser(message) {
			let options = await redis.getList(settings, `${this.room}:options`);

			if (options && options.includes('disablemoderation')) return;
			if (this.canUse(1)) return;

			if (!(options && options.includes('allowflooding'))) {
				addBuffer(this.userid, this.room, message);

				let msgs = 0;
				let identical = 0;

				for (let i = 0; i < buffers[this.room].length; i++) {
					if (buffers[this.room][i][0] === this.userid) {
						msgs++;
						if (buffers[this.room][i][1] === message) identical++;
					}
				}

				if (msgs >= 5 || identical >= 3) {
					return punish(this.username, this.room, 2, 'Do not flood the chat.');
				}
			}

			if (!(options && options.includes('allowbold'))) {
				let boldString = message.match(/\*\*([^< ](?:[^<]*?[^< ])??)\*\*/g);
				if (boldString) {
					let len = message.replace('*', '').length;
					let boldLen = boldString.reduce((prev, cur) => prev + cur.length, 0);
					if (boldLen >= 0.8 * len) {
						return punish(this.username, this.room, 1, 'Do not abuse bold.');
					}
				}
			}

			// Moderation for caps and stretching copied from boTTT.
			if (!(options && options.includes('allowcaps'))) {
				let capsString = message.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);
				let len = toId(message).length;

				if (len >= 10 && capsString && (capsString.length / len) >= 0.8) {
					return punish(this.username, this.room, 1, 'Do not abuse caps.');
				}
			}

			if (!(options && options.includes('allowstretching'))) {
				let stretchString = message.replace(/ {2,}/g, ' ');

				if (/(.)\1{7,}/gi.test(stretchString) || (/(..+)\1{4,}/gi.test(stretchString) && !/(\d+\/)+/gi.test(stretchString))) {
					return punish(this.username, this.room, 1, 'Do not stretch.');
				}
			}
		},
	},
};
