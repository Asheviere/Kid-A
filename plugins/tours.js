'use strict';

const Page = require('../page.js');
const redis = require('../redis.js');
const server = require('../server.js');
const utils = require('../utils.js');

const WIFI_ROOM = 'wifi';
const BAN_DURATION = 3 * 30 * 24 * 60 * 60 * 1000;
const FC_REGEX = /[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}/;

let curTournament;

const settings = redis.useDatabase('settings');
let friendcodes = redis.useDatabase('friendcodes');

class Tour {
	constructor(room, format, prize) {
		this.format = format;
		this.participants = [];
		this.matchups = [];
		this.data = [];
		this.room = room;
		this.prize = prize;
		this.fcs = {};

		this.db = redis.useDatabase('tours');

		this.started = false;
		this.finished = false;

		this.repeatMsg = `Signups for the **3DS** in-game **${this.format}** tournament are in progress! ${server.url}${WIFI_ROOM}/tournament PM a tour helper to sign up!${this.prize ? ` Prize list: ${this.prize}` : ''}`;
		this.timer = setInterval(() => {
			if (this.repeatMsg) Connection.send(`${this.room}|/wall ${this.repeatMsg}`);
		}, 1000 * 60 * 5);
	}

	get displayInfo() {
		let rounds = this.data.slice(0);
		if (!this.finished) rounds.push(this.matchups);

		let output = [];
		for (let i = 0; i < rounds.length; i++) {
			let name;
			if (rounds[i].length === 1) {
				name = "Final";
			} else if (rounds[i].length === 2) {
				name = "Semifinals";
			} else {
				name = `Round ${i + 1}`;
			}
			output.push({name: name, matchups: rounds[i]});
		}

		if (this.winner) output.push({name: "Winner", winner: this.winner});

		return output;
	}

	hasId(userid) {
		return this.participants.some(val => toId(val) === userid);
	}

	shuffle() {
		for (let i = this.participants.length - 1; i > 0; i--) {
			let j = Math.floor(Math.random() * i);
			let tmp = this.participants[i];
			this.participants[i] = this.participants[j];
			this.participants[j] = tmp;
		}
	}

	createMatchups(byes) {
		this.matchups = [];
		let i = 0;
		let byedUsers = [];
		for (; i < byes; i++) {
			this.matchups.push([this.participants[i], 'bye', '']);
			byedUsers.push(toId(this.participants[i]));
		}
		for (; i < this.participants.length - 1; i += 2) {
			this.matchups.push([this.participants[i], this.participants[i + 1], '']);
		}
		for (let userid of byedUsers) {
			this.reportWin(userid);
		}
	}

	findMatchup(userid) {
		if (!this.hasId(userid)) return -1;

		return this.matchups.findIndex(matchup => toId(matchup[0]) === userid || toId(matchup[1]) === userid);
	}

	getMatchup(userid) {
		if (!this.hasId(userid)) return;

		let i = this.findMatchup(userid);

		if (i > -1) {
			let j = toId(this.matchups[i][0]) === userid ? 1 : 0;
			return [this.matchups[i][j], this.matchups[i][2]];
		}
	}

	notifyUsers() {
		let notifs = [];

		for (let user of this.participants) {
			let matchup = this.getMatchup(toId(user));
			if (matchup) {
				if (matchup[0] === 'bye') {
					notifs.push(`|/pm ${user}, You have received a bye for this round of the tournament.`);
				} else {
					notifs.push(`|/pm ${user}, Your opponent for this round of the tournament is **${matchup[0]} (FC: ${this.fcs[toId(matchup[0])]})**`);
				}
			}
		}

		let sendNotif = async notifs => {
			if (!notifs.length) return;
			Connection.send(notifs[0]);
			setTimeout(() => sendNotif(notifs.slice(1)), 500);
		};

		sendNotif(notifs);
	}

	addUser(username, fc) {
		if (this.started) return false;
		if (this.hasId(toId(username))) return false;
		if (Object.values(this.fcs).includes(fc)) return false;

		const userid = toId(username);

		Connection.send(`|/pm ${userid}, You have been successfully signed up for the tournament.`);

		this.fcs[userid] = fc;
		friendcodes.set(userid, fc);
		return this.participants.push(username);
	}

	removeUser(userid) {
		if (this.started) {
			let i = this.findMatchup(userid);

			if (i > -1) {
				let j = toId(this.matchups[i][0]) === userid ? 1 : 0;

				this.matchups[i][2] = this.matchups[i][j];

				Connection.send(`|/pm ${this.matchups[i][j]}, Your opponent in the tournament was disqualified, and you will advance to the next round.`);

				return true;
			}
		} else {
			let i = this.participants.findIndex(val => toId(val) === userid);
			if (i > -1) {
				delete this.fcs[userid];
				return this.participants.splice(i, 1);
			}
			return false;
		}
	}

	reportWin(userid) {
		let i = this.findMatchup(userid);

		if (i < 0) return false;

		let j = toId(this.matchups[i][0]) === userid ? 0 : 1;
		this.matchups[i][2] = this.matchups[i][j];
		if (!this.matchups.some(matchup => !matchup[2])) this.progress();
		return true;
	}

	unreportWin(userid) {
		let i = this.findMatchup(userid);

		if (i < 0) return false;

		this.matchups[i][2] = null;
		return true;
	}

	start() {
		if (this.started) return false;
		let byes;
		if (Math.floor(Math.log2(this.participants.length)) !== Math.log2(this.participants.length)) {
			byes = 2 ** Math.ceil(Math.log2(this.participants.length)) - this.participants.length;
		}

		Connection.send(`${this.room}|/wall The ${this.format} tournament has started! See ${server.url}${WIFI_ROOM}/tournament for the bracket!`);

		this.repeatMsg = `There is an in-game ${this.format} tournament going on __(round 1)__! See ${server.url}${WIFI_ROOM}/tournament for the bracket!`;

		this.started = true;
		this.shuffle();
		this.createMatchups(byes);
		this.notifyUsers();

		return true;
	}

	progress() {
		this.data.push(this.matchups);

		let nextRound = [];
		for (let matchup of this.matchups) {
			nextRound.push(matchup[2]);
		}
		if (nextRound.length === 1) {
			this.winner = nextRound[0];
			return this.finish();
		}

		Connection.send(`${this.room}|/wall The next round of the ${this.format} tour has started. Check ${server.url}${WIFI_ROOM}/tournament for the bracket!`);
		this.repeatMsg = `There is an in-game ${this.format} tournament going on __(round ${this.data.length + 1})__! See ${server.url}${WIFI_ROOM}/tournament for the bracket!`;

		this.participants = nextRound;
		this.createMatchups();
		this.notifyUsers();
	}

	forceEnd() {
		Connection.send(`${this.room}|/wall The in-game tournament was forcibly ended.`);

		this.finished = true;
		clearTimeout(this.timer);
	}

	finish() {
		Connection.send(`${this.room}|/wall Congratulations to **${this.winner}** for winning the ${this.format} tournament!`);

		this.finished = true;

		clearTimeout(this.timer);
	}
}

async function tournamentGenerator() {
	let settings = redis.useDatabase('settings');
	let data;
	if (curTournament) {
		if (curTournament.started) {
			data = {finished: curTournament.finished, format: curTournament.format, bracket: curTournament.displayInfo};
		} else {
			data = {format: curTournament.format, num: curTournament.participants.length, participants: curTournament.participants};
		}
	}
	return {tourHelpers: (await settings.hvals('whitelist:tourhelpers')).join(', '), data: data};
}

async function leaderboardGenerator() {
	let db = redis.useDatabase('tours');
	let keys = await db.keys(`${WIFI_ROOM}:*`);
	let data = [];
	for (let key of keys) {
		let entry = await db.hgetall(key);
		if (entry.points === '0' && entry.total === '0') {
			db.del(key);
			continue;
		}
		data.push([entry.username, entry.points, entry.total]);
	}
	data = data.sort((a, b) => a[0].localeCompare(b[0]));
	return data;
}

new Page('tournament', tournamentGenerator, 'tournament.html', {rooms: [WIFI_ROOM]});
new Page('leaderboard', leaderboardGenerator, 'leaderboard.html', {rooms: [WIFI_ROOM]});

const HELP_URL = `${server.url}${WIFI_ROOM}/tours.html`;

async function getBan(userid, fc) {
	let useridBan = (await settings.hget(`tourbans:userids`, userid));
	let fcBan = (await settings.hget(`tourbans:fcs`, fc));
	const output = {};
	if (useridBan) {
		if (useridBan < Date.now()) {
			settings.hdel(`tourbans:userids`, userid);
		} else {
			output.userid = useridBan;
		}
	}
	if (fcBan) {
		if (fcBan < Date.now()) {
			settings.hdel(`tourbans:fcs`, fc);
		} else {
			output.fc = fcBan;
		}
	}
	return output;
}

module.exports = {
	onTourEnd: {
		rooms: [WIFI_ROOM],
		async action(roomid, data) {
			if (data.generator === 'Round Robin') return; // This is currently not supported.
			if (!toId(data.format).includes('leaderboard')) return; // TODO: better way to determine whether to give points for the tour.
			let finalist1 = data.bracketData.rootNode.children[0].team;
			let finalist2 = data.bracketData.rootNode.children[1].team;
			let winner = data.bracketData.rootNode.result === 'win' ? finalist1 : finalist2;
			let runnerup = winner === finalist1 ? finalist2 : finalist1;
			let semifinalists = data.bracketData.rootNode.children[0].children.map(val => val.team).concat(data.bracketData.rootNode.children[1].children.map(val => val.team)).filter(name => ![finalist1, finalist2].includes(name));

			// Get the list of players to determine amount of prize points.
			const getPlayers = node => node.children.length ? getPlayers(node.children[0]).concat(getPlayers(node.children[1])) : [node.team];
			const players = getPlayers(data.bracketData.rootNode);
			let rounds = Math.floor(Math.log2(players.length));

			// If more than half of the players has to play another game, round up.
			if (players.length * 1.5 > 2 ** (rounds + 1)) rounds++;

			// 1 point per round for top 4, plus an additional 1 point for the winner for every round past 4. 2 people tours don't count.
			let prizes = [rounds - 1, rounds - 2, rounds - 3];
			if (prizes[1] < 0) prizes[1] = 0;
			if (prizes[2] < 0) prizes[2] = 0;
			if (rounds > 5) prizes[0] += rounds - 4;

			Connection.send(`${roomid}|/wall Winner: ${winner} (${prizes[0]} point${prizes[0] !== 1 ? 's' : ''}). Runner-up: ${runnerup} (${prizes[1]} point${prizes[1] !== 1 ? 's' : ''})${semifinalists.length ? `. Semi-finalists: ${semifinalists.join(', ')} (${prizes[2]} point${prizes[2] !== 1 ? 's' : ''})` : ''}`);

			const top8 = [];
			if (rounds > 4) {
				for (let final of data.bracketData.rootNode.children) {
					for (let semifinal of final.children) {
						for (let quarterfinal of semifinal.children) {
							if (quarterfinal.result === 'win') {
								top8.push(quarterfinal.children[1].team);
							} else {
								top8.push(quarterfinal.children[0].team);
							}
						}
					}
				}

				Connection.send(`${roomid}|/wall Quarterfinalists (1 point): ${top8.join(', ')}`);
			}

			let db = redis.useDatabase('tours');

			const prizelist = [[runnerup, prizes[1]], [winner, prizes[0]]];
			if (semifinalists.length) {
				prizelist.push([semifinalists[0], prizes[2]]);
				prizelist.push([semifinalists[1], prizes[2]]);
			}
			if (top8.length) {
				for (let name of top8) {
					prizelist.push([name, 1]);
				}
			}
			for (let [username, prize] of prizelist) {
				const userid = toId(username);
				if (!(await db.exists(`${roomid}:${userid}`))) {
					await db.hmset(`${roomid}:${userid}`, 'username', username, 'points', 0, 'total', 0);
				}

				db.hincrby(`${roomid}:${userid}`, 'points', prize);
				db.hincrby(`${roomid}:${userid}`, 'total', prize);
			}
		},
	},
	commands: {
		tour: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.getRoomAuth(WIFI_ROOM)) return;

				let [cmd, ...rest] = message.split(' ');
				rest = rest.join(' ');

				switch (cmd) {
				case 'new':
				case 'create':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					if (curTournament && !curTournament.finished) return this.pmreply("There is still a tournament going on.");

					let [format, room, prize] = rest.split(',').map(param => param.trim());
					if (!format) return this.pmreply(`Invalid parameters. See ${HELP_URL} for a list of commands.`);
					if (room) room = toId(room);

					if (room && room !== WIFI_ROOM) {
						Connection.send(`|/makegroupchat ${room}`);
						room = `groupchat-kida-${room}`;
						let promoTourHelpers = async helpers => {
							if (this.userlists[WIFI_ROOM][helpers[0]] && (this.userlists[WIFI_ROOM][helpers[0]][0] === '%' || this.userlists[WIFI_ROOM][helpers[0]][0] === '@')) {
								Connection.send(`${room}|/roommod ${helpers[0]}`);
							} else {
								Connection.send(`${room}|/roomdriver ${helpers[0]}`);
							}
							setTimeout(() => promoTourHelpers(helpers.slice(1)), 300);
						};

						promoTourHelpers((await this.settings.hkeys('whitelist:tourhelpers')));
					} else {
						room = WIFI_ROOM;
					}

					curTournament = new Tour(room, format, prize);
					if (room !== WIFI_ROOM) Connection.send(`${WIFI_ROOM}|/wall An in-game ${format} tournament was started in <<${room}>>`);
					Connection.send(`${room}|/wall An in-game ${format} tournament was started! See ${server.url}${WIFI_ROOM}/tournament for the bracket!`);
					Connection.send(`${WIFI_ROOM}|/modnote An in-game tournament was started by ${this.username} in '${room}'.`);
					return this.pmreply("A tournament has been created.");
				case 'end':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					if (!curTournament || curTournament.finished) return this.pmreply("There is no current tournament going on.");

					curTournament.forceEnd();

					Connection.send(`${WIFI_ROOM}|/modnote The in-game tournament was forcibly ended by ${this.username}.`);
					return this.pmreply("The tournament was forcibly ended.");
				case 'add':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					let [username, fc] = rest.split(',').map(param => param.trim());
					if (!username || !fc || !FC_REGEX.test(fc)) return this.pmreply("Syntax error. ``.tour add username, fc``");
					fc = toId(fc);
					fc = `${fc.substr(0, 4)}-${fc.substr(4, 4)}-${fc.substr(8, 4)}`;
					if (Object.keys(getBan(toId(username), fc)).length) return this.reply("This user is banned from entering tournaments.");
					if (!utils.validateFc(fc)) return this.reply("Invalid Friend Code.");
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					if (curTournament.addUser(username, fc)) {
						return this.pmreply(`User successfully added. The tournament now has ${curTournament.participants.length} participants.`);
					}
					return this.pmreply("You cannot add new people to the tournament.");
				case 'remove':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					rest = toId(rest);
					if (!rest) return this.pmreply("No username entered.");
					if (curTournament.removeUser(rest)) {
						return this.pmreply("User successfully removed.");
					}
					return this.pmreply("You cannot remove this person from the tournament.");
				case 'start':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					if (curTournament.start()) return this.pmreply("The tournament has been started");
					return this.pmreply("Cannot start this tournament.");
				case 'reportwin':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					rest = toId(rest);
					if (!rest) return this.pmreply("No user entered.");

					if (curTournament.reportWin(rest)) {
						return this.pmreply("Win successfully reported.");
					}

					return this.pmreply("Cannot report a win for this user at the time.");
				case 'unreportwin':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					rest = toId(rest);
					if (!rest) return this.pmreply("No user entered.");

					if (curTournament.unreportWin(rest)) {
						return this.pmreply("Win successfully unreported.");
					}

					return this.pmreply("Cannot uneport a win for this user at the time.");
				case 'matchup':
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					let matchup = curTournament.getMatchup(this.userid);

					if (!matchup) return this.pmreply("You're not in this tournament.");

					if (matchup[0] === 'bye') return this.pmreply("You have received a bye for this round of the tournament.");

					if (matchup[1]) {
						return this.pmreply(`You ${matchup[0] === matchup[1] ? 'lost' : 'won'} your match against ${matchup[0]}.`);
					}

					return this.pmreply(`You're matched up against ${matchup[0]} this round.`);
				default:
					return this.pmreply(`Unknown command. See ${HELP_URL} for the list of commands.`);
				}
			},
		},
		whitelisttourhelper: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				if (await this.settings.hexists('whitelist:tourhelpers', toId(message))) return this.reply("This user is already whitelisted.");

				await this.settings.hset('whitelist:tourhelpers', toId(message), message);
				Connection.send(`${WIFI_ROOM}|/modnote ${toId(message)} was whitelisted as a tour helper by ${this.username}.`);
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelisttourhelper: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				if (!await this.settings.hexists('whitelist:tourhelpers', toId(message))) return this.reply("This user isn't whitelisted.");

				await this.settings.hdel('whitelist:tourhelpers', toId(message));
				Connection.send(`${WIFI_ROOM}|/modnote ${toId(message)} was unwhitelisted as a tour helper by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		tourban: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");

				let [userid, fc] = message.split(',').map(param => param.trim());
				if (!userid || !fc || !FC_REGEX.test(fc)) return this.pmreply("Syntax error. ``.tourban username, fc``");
				userid = toId(userid);
				fc = `${fc.substr(0, 4)}-${fc.substr(4, 4)}-${fc.substr(8, 4)}`;

				const bans = await getBan(userid, fc);
				if ('userid' in bans) {
					this.reply("Username is already banned. Extending.");
					this.settings.hincrby(`tourbans:userids`, userid, BAN_DURATION);
				} else {
					this.settings.hset(`tourbans:userids`, userid, Date.now() + BAN_DURATION);
				}
				if ('fc' in bans) {
					this.reply("FC is already banned. Extending.");
					this.settings.hincrby(`tourbans:fcs`, fc, BAN_DURATION);
				} else {
					this.settings.hset(`tourbans:fcs`, fc, Date.now() + BAN_DURATION);
				}
				return this.reply("User successfully tourbanned.");
			},
		},
		addtp: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");

				let [username, points] = message.split(',').map(param => param.trim());
				points = parseInt(points);
				let userid = toId(username);
				if (!userid || !points || points < 0) return this.pmreply("Syntax error. ``.addtp username, amount``");
				userid = toId(userid);

				let db = redis.useDatabase('tours');

				if (!(await db.exists(`${WIFI_ROOM}:${userid}`))) {
					await db.hmset(`${WIFI_ROOM}:${userid}`, 'username', username, 'points', 0, 'total', 0);
				}

				await db.hincrby(`${WIFI_ROOM}:${userid}`, 'points', points);
				await db.hincrby(`${WIFI_ROOM}:${userid}`, 'total', points);

				return this.reply(`${points} points added for ${username}.`);
			},
		},
		removetp: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");

				let [username, points, total] = message.split(',').map(param => param.trim());
				points = parseInt(points);
				if (total) total = toId(total);
				let removeFromTotal = parseInt(total);
				let userid = toId(username);
				if (!userid || !(points || removeFromTotal) || points < 0) return this.pmreply("Syntax error. ``.removetp username, amount, remove from total``");
				userid = toId(userid);

				let db = redis.useDatabase('tours');
				let entry = await db.hgetall(`${WIFI_ROOM}:${userid}`);

				if (!entry) return this.reply("This person doesn't have any points.");
				if (!removeFromTotal && (total === 'true' || total === 'yes')) removeFromTotal = points;

				if (entry.points < points) return this.reply(`This user doesn't have ${points} points. You can only remove ${entry.points} points.`);
				if (entry.total < removeFromTotal) return this.reply(`This user doesn't have ${removeFromTotal} total points. You can only remove ${entry.total} points.`);

				await db.hincrby(`${WIFI_ROOM}:${userid}`, 'points', -1 * points);
				if (removeFromTotal) await db.hincrby(`${WIFI_ROOM}:${userid}`, 'total', -1 * removeFromTotal);

				return this.reply(`${points} points removed from ${username}${removeFromTotal ? ` and ${removeFromTotal} total points` : ''}.`);
			},
		},
		resettp: {
			rooms: [WIFI_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				let db = redis.useDatabase('tours');
				let keys = await db.keys(`${WIFI_ROOM}:*`);

				let promises = keys.map(async key => {
					const entry = await db.hgetall(key);
					if (entry.points > 50) {
						await db.hset(key, 'points', 50);
						this.sendMail('Kid A', key.split(':')[1], `Your tournament points have been reset. You now have 50 points.`);
					}
					return true;
				});

				await Promise.all(promises);

				Connection.send(`${WIFI_ROOM}|/modnote ${this.username} reset the tour points.`);
				return this.reply(`Points reset.`);
			},
		},
	},
};
