'use strict';

const redis = require('../redis.js');
const settings = redis.useDatabase('settings');
const notol = redis.useDatabase('notol');

let leftpad = val => (val < 10 ? `0${val}`: `${val}`);

const HOUR = 1000 * 60 * 60;
const FIFTEEN_MINS = 1000 * 60 * 15;

function getPunishment(val, options) {
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
		return options.includes('noroombans') ? 'hourmute' : 'roomban';
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

async function punish(username, room, val, msg, options) {
	let userid = toId(username);

	let points = punishments.has(`${room}:${userid}`) ? punishments.get(`${room}:${userid}`)[0] : 0;

	points += val;
	let extraMsg = '';

	if ((await notol.exists(`${room}:${userid}`))) {
		points++;
		extraMsg = " (zero tolerance)";
	}

	if (points >= 3 && (await checkMuted(room, userid))) {
		return ChatHandler.send(room, `/rb ${userid}, Bot moderation: repeated offenses.${extraMsg}`);
	}

	if (points === 1 && !msg.includes('links')) {
		ChatHandler.send(room, `${username}, ${msg}`);
	} else {
		ChatHandler.send(room, `/${getPunishment(points, options)} ${userid}, Bot moderation: ${msg}${extraMsg}`);
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
	options: [['disablemoderation', "Disable bot moderation"], ['allowbold', "Don't moderate for bold"], ['allowcaps', "Don't moderate for caps"], ['allowstretching', "Don't moderate for stretching"], ['allowflooding', "Don't moderate for flooding"], ['disallowbattlelinks', "Don't allow posting battle and replay links"], ['noroombans', "Don't roomban users when doing automated punishments."]],

	analyzer: {
		async parser(message, timestamp) {
			if (this.options.includes('disablemoderation')) return;

			if (message.startsWith('/log')) {
				let array = /\/log (.+?) was muted by (.+?) for ([0-9]+?) minutes/g.exec(message);
				if (array) {
					if ((await notol.exists(`${this.room}:${toId(array[1])}`))) {
						const duration = parseInt(array[3]);
						if (duration === 7) {
							return ChatHandler.send(this.room, `/hm ${array[1]}, Bot Moderation: Extending punishment for zero tolerance user.`);
						} else if (duration === 60 && !this.options.includes('noroombans')) {
							return ChatHandler.send(this.room, `/rb ${array[1]}, Bot Moderation: Escalating punishment for zero tolerance user.`);
						}
					}
				}

				array = /\/log (.+?) was warned by (.+?)\./g.exec(message);

				if (array) {
					if ((await notol.exists(`${this.room}:${toId(array[1])}`))) {
						return ChatHandler.send(this.room, `/m ${array[1]}, Bot Moderation: Escalating punishment for zero tolerance user.`);
					}
				}
			}

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
					return punish(this.username, this.room, 2, 'Do not flood the chat.', this.options);
				}
			}

			if (this.canUse(1)) return;

			if (!this.options.includes('allowbold')) {
				let boldString = message.match(/\*\*([^< ](?:[^<]*?[^< ])??)\*\*/g);
				if (boldString) {
					let len = message.replace('*', '').length;
					let boldLen = boldString.reduce((prev, cur) => prev + cur.length, 0);
					if (boldLen >= 0.8 * len) {
						return punish(this.username, this.room, 1, 'Do not abuse bold.', this.options);
					}
				}
			}

			// Moderation for caps and stretching copied from boTTT.
			if (!this.options.includes('allowcaps')) {
				let capsString = message.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);
				let len = toId(message).length;

				if (len >= 10 && capsString && (capsString.length / len) >= 0.8) {
					return punish(this.username, this.room, 1, 'Do not abuse caps.', this.options);
				}
			}

			if (!this.options.includes('allowstretching')) {
				let stretchString = message.replace(/ {2,}/g, ' ');

				if (/(.)\1{7,}/gi.test(stretchString) || (/(..+)\1{4,}/gi.test(stretchString) && !/(\d+\/)+/gi.test(stretchString))) {
					return punish(this.username, this.room, 1, 'Do not stretch.', this.options);
				}
			}

			if (this.options.includes('disallowbattlelinks')) {
				if (/replay.pokemonshowdown\.com\//gi.test(message) || /play\.pokemonshowdown\.com\/battle-/gi.test(message) ||
				/<<battle-[a-z\-0-9]+>>/gi.test(message)) {
					return punish(this.username, this.room, 1, 'Do not post battle or replay links.', this.options);
				}
			}
		},
	},
	commands: {
		notol: {
			permission: 4,
			requireRoom: true,
			async action(message) {
				let [username, ...reason] = message.split(',');
				if (!toId(username)) return this.reply("No username entered, Syntax: ``.notol username, reason``");
				username = username.trim();
				reason = reason.join(',').trim();
				let userid = toId(username);

				if ((await notol.exists(`${this.room}:${userid}`))) return this.reply("This user is already on zero tolerance.");

				notol.hmset(`${this.room}:${userid}`, 'time', Date.now(), 'username', username, 'reason', reason);

				ChatHandler.send(this.room, `/modnote ${userid} was marked as zero tolerance by ${this.username}.${reason ? ` (${reason})` : ''}`);
			},
		},
		removenotol: {
			permission: 4,
			requireRoom: true,
			async action(message) {
				let userid = toId(message);
				if (!userid) return this.pmreply("No username entered. Syntax: ``.removenotol <username>``");

				if ((await notol.delete(`${this.room}:${userid}`))) {
					ChatHandler.send(this.room, `/modnote ${userid} was unmarked as zero tolerance by ${this.username}.`);
				} else {
					this.pmreply("This user isn't marked as zero tolerance.");
				}
			},
		},
		viewnotol: {
			permission: 2,
			requireRoom: true,
			async action() {
				let html = '';
				// Old notol
				const oldNotol = await this.settings.lrange(`${this.room}:notol`, 0, -1);
				if (oldNotol.length) {
					this.replyHTML(`Old notol list: ${oldNotol.join(', ')}<br/>`, true);
				}

				const keys = await notol.keys(`${this.room}:*`);

				if (keys.length) {
					const rows = [];
					rows.push(`<th>Username</th><th>Added on</th>`);

					for (const key of keys) {
						const entry = await notol.hgetall(key);
						const date = new Date(parseInt(entry.time) || 0);
						rows.push(`<td>${entry.username}</td><td>${leftpad(date.getDate())}/${leftpad(date.getMonth() + 1)}/${date.getFullYear()}</td></tr><tr><td colspan="2"><i>- ${entry.reason}</i></td>`);
					}

					html += `<table><tr>${rows.join('</tr><tr>')}</tr></table>`;
				}

				if (!html) return this.reply("This room has no zero tolerance users.");
				this.replyHTML(html, true);
			},
		},
	},
};
