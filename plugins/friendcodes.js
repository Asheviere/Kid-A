'use strict';

const redis = require('../redis.js');
const utils = require('../utils.js');

const WIFI_ROOM = 'wifi';
const INGAME_ROOM = 'pokemongames';

let friendcodes = redis.useDatabase('friendcodes');

const getFCs = async key => (await friendcodes.get(key)).split(':');

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
				fc = Utils.toFc(fc);
				if (!fc) return this.pmreply("Invalid formatting for Friend Code. format: ``1111-2222-3333``");
				if (!utils.validateFc(fc)) return this.pmreply("The Friend code you entered is invalid");

				let fcstr = fc;
				if (await friendcodes.exists(name)) {
					const fcs = await getFCs(name);
					if (fcs.includes(fc)) return this.pmreply("This friend code is already registered.");
					fcstr = `:${fc}`;
				}
				await friendcodes.append(name, fcstr);

				if (room) ChatHandler.send(room, `/modnote ${this.username} added a friend code for ${name}: ${fc}`);
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

				let [name, ...fcs] = message.split(',').map(param => toId(param));

				fcs = fcs.map(fc => Utils.toFc(fc)).filter(fc => !!fc);

				if (await friendcodes.exists(name)) {
					if (fcs.length) {
						const userFCs = await getFCs(name);
						await friendcodes.set(name, userFCs.filter(fc => !fcs.includes(fc)).join(':'));
					} else {
						await friendcodes.del(name);
					}
					if (room) ChatHandler.send(room, `/modnote ${this.username} deleted ${name}'s friend code.`);
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

				const fcs = await getFCs(message);

				if (this.canUse(1)) {
					this.reply(`${self ? "Your" : message + "'s"} friend code${fcs.length > 1 ? 's' : ''}: ${fcs.join(', ')}`);
				} else {
					this.pmreply(`${self ? "Your" : message + "'s"} friend code${fcs.length > 1 ? 's' : ''}: ${fcs.join(', ')}`);
				}
			},
		},
		markshitter: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				const fc = Utils.toFc(message);
				if (!fc) return this.pmreply("Please enter a valid fc.");

				let found = false;

				const fcs = await friendcodes.keys('*');
				for (let i = 0; i < fcs.length; i++) {
					const entry = await friendcodes.get(fcs[i]);
					if (entry.split(':').includes(fc)) {
						found = true;
						break;
					}
				}

				if (!found) return this.pmreply("This friend code isn't in the friend code database.");

				const shitters = await this.settings.lrange(`${WIFI_ROOM}:shitters`, 0, -1);

				if (shitters.includes(fc)) return this.reply("This FC is already marked as a shitter.");

				await this.settings.lpush(`${WIFI_ROOM}:shitters`, fc);
				ChatHandler.send(WIFI_ROOM, `/modnote the FC '${fc}' was marked as a shitter by ${this.username}.`);
				return this.reply("FC successfully marked.");
			},
		},
		unmarkshitter: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				const fc = Utils.toFc(message);
				if (!fc) return this.pmreply("Please enter a valid fc.");

				const shitters = await this.settings.lrange(`${WIFI_ROOM}:shitters`, 0, -1);

				if (!shitters.includes(fc)) return this.reply("This FC isn't marked as a shitter.");

				await this.settings.lrem(`${WIFI_ROOM}:shitters`, 0, fc);
				ChatHandler.send(WIFI_ROOM, `/modnote the FC '${fc}' was unmarked as a shitter by ${this.username}.`);
				return this.reply("FC successfully unmarked.");
			},
		},
	},
};
