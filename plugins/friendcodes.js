'use strict';

const fs = require('fs');

const redis = require('../redis.js');
const utils = require('../utils.js');

const WIFI_ROOM = 'wifi';
const INGAME_ROOM = 'sunmoon';

const FC_REGEX = /[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}/;

let friendcodes = redis.useDatabase('friendcodes');

module.exports = {
	commands: {
		addfc: {
			rooms: [WIFI_ROOM, INGAME_ROOM],
			async action(message) {
				let room = this.room;
				let hasPermission = false;
				if (this.userlists[WIFI_ROOM] && this.userid in this.userlists[WIFI_ROOM]) {
					this.auth = this.userlists[WIFI_ROOM][this.userid][0];
					room = WIFI_ROOM;
					hasPermission = this.canUse(2);
				}
				if (!hasPermission && this.userlists[INGAME_ROOM] && this.userid in this.userlists[INGAME_ROOM]) {
					this.auth = this.userlists[INGAME_ROOM][this.userid][0];
					room = INGAME_ROOM;
					hasPermission = this.canUse(2);
				}
				if (!hasPermission) {
					return this.pmreply(`You need to be in either the ${WIFI_ROOM} or ${INGAME_ROOM} room and have % or above in that room to use this command.`);
				}

				let [name, fc] = message.split(',');
				if (!(name && fc)) return this.pmreply("Syntax: ``.addfc name, fc``");

				name = toId(name);
				if (!FC_REGEX.test(fc.trim())) return this.pmreply("Invalid formatting for Friend Code. format: ``1111-2222-3333``");
				fc = toId(fc);
				fc = fc.substr(0, 4) + '-' + fc.substr(4, 4) + '-' + fc.substr(8, 4);
				if (!utils.validateFc(fc)) return this.pmreply("The Friend code you entered is invalid");

				await friendcodes.set(name, fc);

				if (room) Connection.send(`${room}|/modnote ${this.username} added a friend code for ${name}: ${fc}`);
				this.reply("Friend Code successfully added.");
			},
		},
		deletefc: {
			rooms: [WIFI_ROOM, INGAME_ROOM],
			async action(message) {
				let room = this.room;
				if (!this.canUse(2)) {
					let hasPermission = false;
					if (this.userlists[WIFI_ROOM] && this.userid in this.userlists[WIFI_ROOM]) {
						this.auth = this.userlists[WIFI_ROOM][this.userid][0];
						room = WIFI_ROOM;
						hasPermission = this.canUse(2);
					}
					if (!hasPermission && this.userlists[INGAME_ROOM] && this.userid in this.userlists[INGAME_ROOM]) {
						this.auth = this.userlists[INGAME_ROOM][this.userid][0];
						room = INGAME_ROOM;
						hasPermission = this.canUse(2);
					}
					if (!hasPermission) {
						return this.pmreply(`You need to be in either the <<${WIFI_ROOM}>> or <<${INGAME_ROOM}>> room and have % or above in that room to use this command.`);
					}
				}

				let name = toId(message);

				if (await friendcodes.del(name)) {
					if (room) Connection.send(`${room}|/modnote ${this.username} deleted ${name}'s friend code.`);
					this.reply("Friend Code successfully deleted.");
				} else {
					this.pmreply("This person doesn't have a friend code registered.");
				}
			},
		},
		fc: {
			async action(message) {
				if (message) {
					message = toId(message);
				} else {
					message = this.userid;
				}

				let self = message === this.userid;

				if (!(await friendcodes.exists(message))) return this.pmreply((self ? "You don't" : "This person doesn't") + " have a friend code registered." + (self ? ` PM a staff member in the <<${WIFI_ROOM}>> or <<${INGAME_ROOM}>> room to have your FC added.` : ""));

				if (this.canUse(1)) {
					this.reply((self ? "Your" : message + "'s") + " friend code: " + (await friendcodes.get(message)));
				} else {
					this.pmreply((self ? "Your" : message + "'s") + " friend code: " + (await friendcodes.get(message)));
				}
			},
		},
	},
};
