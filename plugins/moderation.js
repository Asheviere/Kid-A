'use strict';

const databases = require('../databases.js');

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

let punishments = {};
let mutes = {};
let muteTimers = {};

function punish(userid, ips, room, val, msg) {
	if (!punishments[room]) punishments[room] = {};
	if (!ips) ips = [userid];
	let max = 0;

	for (let i = 0; i < ips.length; i++) {
		max = val;
		if (ips[i] in punishments[room]) {
			punishments[room][ips[i]] += val;
			if (punishments[room][ips[i]] > max) max = punishments[room][ips[i]];
		} else {
			punishments[room][ips[i]] = val;
		}
		setTimeout(() => {
			punishments[room][ips[i]] -= val;
			if (!punishments[room][ips[i]]) delete punishments[room][ips[i]];
		}, 1000 * 60 * 15);
	}

	Connection.send(room + '|/' + getPunishment(max) + ' ' + userid + ',' + msg);

	if (max >= 3 && Config.checkIps) {
		if (!mutes[userid]) mutes[userid] = [];
		if (!muteTimers[userid]) muteTimers[userid] = {};
		if (mutes[userid].includes(room)) {
			clearTimeout(muteTimers[userid][room]);
		} else {
			mutes[userid].push(room);
		}
		if (mutes[userid].length >= 3) {
			Connection.send('staff|/l ' + userid + ', Bot moderation: Breaking chat rules in multiple rooms.');
			Connection.send('staff|/modnote ' + userid + ' was locked for breaking chat rules in the following rooms: ' + mutes[userid].join(', '));
			delete mutes[userid];
			for (let j in muteTimers[userid]) {
				clearTimeout(muteTimers[userid][j]);
			}
			delete muteTimers[userid];
		} else {
			muteTimers[userid][room] = setTimeout(() => {
				delete muteTimers[userid][room];
				mutes[userid].splice(mutes[userid].indexOf(room), 1);
				if (!mutes[userid].length) delete mutes[userid];
			}, 1000 * 60 * 15);
		}
	}
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
	commands: {
		moderation(userstr, room, message) {
			if (!canUse(userstr, 5)) return this.pmreply("Permission denied.");
			if (!room) return this.pmreply("This command can't be used in PMs.");

			if (!this.settings.modRooms) this.settings.modRooms = [];

			message = toId(message);
			let idx = this.settings.modRooms.indexOf(room);

			switch (message) {
			case 'on':
			case 'true':
			case 'yes':
			case 'enable':
				if (idx < 0) {
					this.settings.modRooms.push(room);
					databases.writeDatabase('settings');
					return this.reply("Bot moderation was turned on in this room.");
				}
				return this.reply("Bot moderation is already turned on.");
			case 'off':
			case 'false':
			case 'no':
			case 'disable':
				if (idx > -1) {
					this.settings.modRooms.splice(idx, 1);
					databases.writeDatabase('settings');
					return this.reply("Bot moderation was turned off in this room.");
				}
				return this.reply("Bot moderation is already turned off.");
			default:
				return this.pmreply("Invalid value. Use 'on' or 'off'.");
			}
		},
	},

	analyzer: {
		rooms: databases.getDatabase('settings').modRooms,
		parser(room, message, userstr) {
			if (canUse(userstr, 1)) return;

			let userid = toId(userstr);

			addBuffer(userid, room, message);

			let msgs = 0;
			let identical = 0;

			for (let i = 0; i < buffers[room].length; i++) {
				if (buffers[room][i][0] === userid) {
					msgs++;
					if (buffers[room][i][1] === message) identical++;
				}
			}

			if (msgs >= 5 || identical >= 3) {
				if (Config.checkIps) {
					Handler.checkIp(userid, (userid, ips) => {
						punish(userid, ips, room, 2, 'Bot moderation: flooding');
					});
				} else {
					punish(userid, [userid], room, 2, 'Bot moderation: flooding');
				}
				return;
			}

			// Moderation for caps and stretching copied from boTTT.
			let capsString = message.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);
			let len = toId(message).length;

			if (len >= 10 && capsString && (capsString.length / len) >= 0.8) {
				if (Config.checkIps) {
					Handler.checkIp(userid, (userid, ips) => {
						punish(userid, ips, room, 1, 'Bot moderation: caps');
					});
				} else {
					punish(userid, [userid], room, 1, 'Bot moderation: caps');
				}
				return;
			}

			if (/(.)\1{7,}/gi.test(message) || (/(..+)\1{4,}/gi.test(message) && !/(\d+\/)+/gi.test(message))) {
				if (Config.checkIps) {
					Handler.checkIp(userid, (userid, ips) => {
						punish(userid, ips, room, 1, 'Bot moderation: stretching');
					});
				} else {
					punish(userid, [userid], room, 1, 'Bot moderation: stretching');
				}
				return;
			}
		},
	},
};
