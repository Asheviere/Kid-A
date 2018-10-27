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
let punishments = new Map();

async function checkMuted(roomid, userid) {
	let thisid = userid;

	let muted = false;

	muted = mutes.has(`${roomid}:${thisid}`) || muted;
	mutes.add(`${roomid}:${thisid}`);
	setTimeout(() => mutes.delete(`${roomid}:${thisid}`), HOUR);

	return muted;
}

async function punish(username, room, val, msg) {
	let userid = toId(username);

	let points = punishments.has(`${room}:${userid}`) ? punishments.get(`${room}:${userid}`)[0] : 0;

	points += val;
	let extraMsg = '';

	let notol = await settings.lrange(`${room}:notol`, 0, -1);
	if (notol.includes(userid)) {
		points++;
		extraMsg = " (zero tolerance)";
	}

	if (points >= 3 && (await checkMuted(room, userid))) {
		return ChatHandler.send(room, `/rb ${userid}, Bot moderation: repeated offenses.${extraMsg}`);
	}

	if (points === 1) {
		ChatHandler.send(room, `${username}, ${msg}`);
	} else {
		ChatHandler.send(room, `/${getPunishment(points)} ${userid}, Bot moderation: ${msg}${extraMsg}`);
	}

	if (punishments.has(`${room}:${userid}`)) {
		clearTimeout(punishments.get(`${room}:${userid}`)[1]);
	}

	punishments.set(`${room}:${userid}`, [points, setTimeout(() => punishments.delete(`${room}:${userid}`), FIFTEEN_MINS)]);
}

const buffers = {};

function addBuffer(userid, room, message, timestamp) {
	if (!buffers[room]) buffers[room] = [];
	buffers[room].push([userid, message, timestamp]);
	if (buffers[room].length > 7) buffers[room].splice(0, 1);
}

module.exports = {
	options: ['disablemoderation', 'allowbold', 'allowcaps', 'allowstretching', 'allowflooding', 'disallowbattlelinks'],

	analyzer: {
		async parser(message, timestamp) {
			if (this.options.includes('disablemoderation')) return;

			if (!this.options.includes('allowflooding')) {
				addBuffer(this.userid, this.room, message, timestamp);
				if (this.canUse(1)) return;

				let msgs = 0;
				let identical = 0;
				let first = 0;
				let last = 0;

				for (let i = 0; i < buffers[this.room].length; i++) {
					if (buffers[this.room][i][0] === this.userid) {
						if (!first) first = buffers[this.room][i][2];
						last = buffers[this.room][i][2];
						msgs++;
						if (buffers[this.room][i][1] === message) identical++;
					}
				}

				if ((msgs >= 5 || identical >= 3) && last - first < 7500) {
					return punish(this.username, this.room, 2, 'Do not flood the chat.');
				}
			}

			if (this.canUse(1)) return;

			if (!this.options.includes('allowbold')) {
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
			if (!this.options.includes('allowcaps')) {
				let capsString = message.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);
				let len = toId(message).length;

				if (len >= 10 && capsString && (capsString.length / len) >= 0.8) {
					return punish(this.username, this.room, 1, 'Do not abuse caps.');
				}
			}

			if (!this.options.includes('allowstretching')) {
				let stretchString = message.replace(/ {2,}/g, ' ');

				if (/(.)\1{7,}/gi.test(stretchString) || (/(..+)\1{4,}/gi.test(stretchString) && !/(\d+\/)+/gi.test(stretchString))) {
					return punish(this.username, this.room, 1, 'Do not stretch.');
				}
			}

			if (this.options.includes('disallowbattlelinks')) {
				if (/replay.pokemonshowdown\.com\//gi.test(message) || /play\.pokemonshowdown\.com\/battle-/gi.test(message) ||
				/<<battle-[a-z\-0-9]+>>/gi.test(message)) {
					return punish(this.username, this.room, 1, 'Do not post battle or replay links.');
				}
			}
		},
	},
	commands: {
		notol: {
			permission: 4,
			disallowPM: true,
			async action(message) {
				let userid = toId(message);
				if (!userid) return this.pmreply("No username entered. Syntax: ``.notol <username>``");

				let notol = await this.settings.lrange(`${this.room}:notol`, 0, -1);

				if (notol.includes(userid)) return this.pmreply("This user is already marked as zero tolerance.");

				this.settings.rpush(`${this.room}:notol`, userid);
				ChatHandler.send(this.room, `/modnote ${userid} was marked as zero tolerance by ${this.username}.`);
			},
		},
		removenotol: {
			permission: 4,
			disallowPM: true,
			async action(message) {
				let userid = toId(message);
				if (!userid) return this.pmreply("No username entered. Syntax: ``.removenotol <username>``");

				if ((await this.settings.lrem(`${this.room}:notol`, 0, userid))) {
					ChatHandler.send(this.room, `/modnote ${userid} was unmarked as zero tolerance by ${this.username}.`);
				} else {
					this.pmreply("This user isn't marked as zero tolerance.");
				}
			},
		},
	},
};
