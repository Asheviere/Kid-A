const redis = require('../redis.js');
const server = require('../server.js');

const WIFI_ROOM = 'wifi';

let curTournament;

server.addTemplate('tournament', 'tournament.html');
server.addTemplate('leaderboard', 'leaderboard.html');

class Tour {
	constructor(room, format, points, prize) {
		this.format = format;
		this.participants = [];
		this.matchups = [];
		this.data = [];
		this.points = points;
		this.room = room;
		this.prize = prize;

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

	createMatchups() {
		this.matchups = [];
		for (let i = 0; i < this.participants.length - 1; i += 2) {
			this.matchups.push([this.participants[i], this.participants[i + 1], '']);
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
			if (matchup) notifs.push(`|/pm ${user}, Your opponent for this round of the tournament is **${matchup[0]}**`);
		}

		let sendNotif = async notifs => {
			Connection.send(notifs[0]);
			setTimeout(() => sendNotif(notifs.slice(1)), 500);
		};

		sendNotif(notifs);
	}

	addUser(username) {
		if (this.started) return false;
		if (this.hasId(toId(username))) return false;

		Connection.send(`${toId(username)}|You have been successfully signed up for the tournament.`);

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

	start() {
		if (this.started) return false;
		if (Math.floor(Math.log2(this.participants.length)) !== Math.log2(this.participants.length)) return false;

		Connection.send(`${this.room}|/wall The ${this.format} tournament has started! See ${server.url}${WIFI_ROOM}/tournament for the bracket!`);

		this.repeatMsg = `There is an in-game ${this.format} tournament going on __(round 1)__! See ${server.url}${WIFI_ROOM}/tournament for the bracket!`;

		this.started = true;
		this.shuffle();
		this.createMatchups();
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
		Connection.send(`${this.room}|/wall Congratulations to **${this.winner}** for winning the ${this.format} tournament and receiving ${this.points[0]} point${this.points[0] > 1 ? 's' : ''}!`);

		let userdata = {};

		for (let i = 0; i < this.data.length; i++) {
			for (let matchup of this.data[i]) {
				if (!userdata[toId(matchup[0])]) userdata[toId(matchup[0])] = {name: matchup[0], wins: 0, losses: 0, points: 0};
				if (!userdata[toId(matchup[1])]) userdata[toId(matchup[1])] = {name: matchup[1], wins: 0, losses: 0, points: 0};
				if (matchup[2] === matchup[0]) {
					userdata[toId(matchup[0])].wins++;
					userdata[toId(matchup[1])].losses++;
					if (i === this.data.length - 1) {
						userdata[toId(matchup[0])].points += this.points[0];
						userdata[toId(matchup[1])].points += this.points[1];
					} else if (i === this.data.length - 2) {
						userdata[toId(matchup[1])].points += this.points[2];
					}
				} else {
					userdata[toId(matchup[1])].wins++;
					userdata[toId(matchup[0])].losses++;
					if (i === this.data.length - 1) {
						userdata[toId(matchup[1])].points += this.points[0];
						userdata[toId(matchup[0])].points += this.points[1];
					} else if (i === this.data.length - 2) {
						userdata[toId(matchup[0])].points += this.points[2];
					}
				}
			}
		}

		for (let i in userdata) {
			for (let key in userdata[i]) {
				if (key === 'name') {
					this.db.hset(`${WIFI_ROOM}:${i}`, key, userdata[i][key]);
				} else {
					this.db.hincrby(`${WIFI_ROOM}:${i}`, key, userdata[i][key]);
				}
			}
		}

		this.finished = true;

		clearTimeout(this.timer);
	}
}

async function tournamentResolver(req, res) {
	let settings = redis.useDatabase('settings');
	let data;
	if (curTournament) {
		if (curTournament.started) {
			data = {finished: curTournament.finished, format: curTournament.format, bracket: curTournament.displayInfo};
		} else {
			data = {format: curTournament.format, num: curTournament.participants.length, participants: curTournament.participants};
		}
	}
	res.end(server.renderTemplate('tournament', {tourHelpers: (await settings.hvals('whitelist:tourhelpers')).join(', '), data: data}));
}

server.addRoute(`/${WIFI_ROOM}/tournament`, tournamentResolver);

async function leaderboardResolver(req, res) {
	let db = redis.useDatabase('tours');
	let keys = await db.keys(`${WIFI_ROOM}:*`);
	let data = [];
	for (let key of keys) {
		let entry = await db.hgetall(key);
		data.push([entry.name, entry.wins, entry.losses, (entry.wins / entry.losses).toFixed(2), entry.points]);
	}
	data = data.sort((a, b) => parseInt(a[4]) > parseInt(b[4]) ? -1 : 1);
	res.end(server.renderTemplate('leaderboard', data));
}

server.addRoute(`/${WIFI_ROOM}/leaderboard`, leaderboardResolver);

const HELP_URL = `${server.url}${WIFI_ROOM}/tours.html`;

module.exports = {
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

					let [format, point1, point2, point3, room, prize] = rest.split(',').map(param => param.trim());
					let points = [point1, point2, point3];
					if (!format || points.length !== 3) return this.pmreply(`Invalid parameters. See ${HELP_URL} for a list of commands.`);
					points = points.map(val => parseInt(val));
					if (points.some(val => isNaN(val) || val < 0)) return this.pmreply("Points need to be valid numbers.");
					if (room) room = room.toLowerCase();

					if (room && room !== WIFI_ROOM) {
						Connection.send(`|/join ${room}`);
					} else {
						room = WIFI_ROOM;
					}

					curTournament = new Tour(room, format, points, prize);
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
					if (!rest.trim()) return this.pmreply("No username entered.");
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					if (curTournament.addUser(rest.trim())) {
						return this.pmreply(`User successfully added. The tournament now has ${curTournament.participants.length} participants.`);
					}
					return this.pmreply("You cannot add new people to the tournament.");
				case 'remove':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");
					if (!rest.trim()) return this.pmreply("No username entered.");
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					if (curTournament.removeUser(rest.trim())) {
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
				case 'matchup':
					if (!curTournament) return this.pmreply("There is no tournament right now.");
					let matchup = curTournament.getMatchup(this.userid);

					if (!matchup) return this.pmreply("You're not in this tournament.");
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
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

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
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				if (!await this.settings.hexists('whitelist:tourhelpers', toId(message))) return this.reply("This user isn't whitelisted.");

				await this.settings.hdel('whitelist:tourhelpers', toId(message));
				Connection.send(`${WIFI_ROOM}|/modnote ${toId(message)} was unwhitelisted as a tour helper by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
	},
};
