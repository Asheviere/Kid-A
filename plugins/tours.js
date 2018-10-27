'use strict';

const EventEmitter = require('events');

const Page = require('../page.js');
const redis = require('../redis.js');

const WIFI_ROOM = 'wifi';
const DECAY_CAP = 50;
const EXPIRATION_TIMER = 2 * 30 * 24 * 60 * 60 * 1000;

const settings = redis.useDatabase('settings');

async function leaderboardGenerator() {
	let db = redis.useDatabase('tours');
	let keys = await db.keys(`${WIFI_ROOM}:*`);
	let data = [];
	for (let key of keys) {
		let entry = await db.hgetall(key);
		if (!entry.username) {
			Debug.log(2, `No name found for ${key}`);
			continue;
		}
		if (entry.points === '0' && entry.total === '0') {
			db.del(key);
			continue;
		}
		data.push([entry.username, entry.points, entry.total]);
	}
	data = data.sort((a, b) => a[0].localeCompare(b[0]));
	return {tourHelpers: (await settings.hvals('whitelist:tourhelpers')).join(', '), data: data};
}

new Page('leaderboard', leaderboardGenerator, 'leaderboard.html', {rooms: [WIFI_ROOM]});

const listener = new EventEmitter();

listener.on('update', (roomid, data) => {
	if (!data.bracketData || data.bracketData.type !== 'tree') return;
	if (data.bracketData.rootNode.state === 'inprogress' && data.bracketData.rootNode.room) {
		ChatHandler.send(roomid, `/wall Watch the finals of the tournament! <<${data.bracketData.rootNode.room}>>`);
	}
});

listener.on('end', async (roomid, data) => {
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

	ChatHandler.send(roomid, `/wall Winner: ${winner} (${prizes[0]} point${prizes[0] !== 1 ? 's' : ''}). Runner-up: ${runnerup} (${prizes[1]} point${prizes[1] !== 1 ? 's' : ''})${semifinalists.length ? `. Semi-finalists: ${semifinalists.join(', ')} (${prizes[2]} point${prizes[2] !== 1 ? 's' : ''})` : ''}`);

	const top8 = [];
	if (rounds > 4) {
		const top4 = semifinalists.concat([winner, runnerup]);
		for (let final of data.bracketData.rootNode.children) {
			for (let semifinal of final.children) {
				for (let quarterfinal of semifinal.children) {
					if (!top4.includes(quarterfinal.team)) top8.push(quarterfinal.team);
				}
			}
		}

		ChatHandler.send(roomid, `/wall Quarterfinalists (1 point): ${top8.join(', ')}`);
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
		db.hset(`${roomid}:${userid}`, 'timestamp', Date.now());
	}
});

module.exports = {
	tours: {
		rooms: [WIFI_ROOM],
		listener: listener,
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
					let format = rest;
					let rated = false;
					let rules = '';
					if (toId(format) === 'leaderboard') {
						const {format: leaderboardFormat, rules: leaderboardRules} = await settings.hgetall(`${WIFI_ROOM}:leaderboard`);
						if (!leaderboardFormat) return this.reply("This room doesn't have a leaderboard format set. Set with ``.tour leaderboard``");

						rated = true;
						format = leaderboardFormat;
						rules = leaderboardRules || '';
					}
					ChatHandler.send(WIFI_ROOM, `/tour new ${format}, elimination`);
					ChatHandler.send(WIFI_ROOM, `/tour autostart 5`);
					ChatHandler.send(WIFI_ROOM, `/tour autodq 2`);
					ChatHandler.send(WIFI_ROOM, `/tour forcetimer`);
					if (rated) {
						ChatHandler.send(WIFI_ROOM, `/tour name ${format} Leaderboard`);
						ChatHandler.send(WIFI_ROOM, `/tour scouting disallow`);
						ChatHandler.send(WIFI_ROOM, `/tour rules ${rules}`);
						ChatHandler.send(WIFI_ROOM, `/wall Tournament Points will be awarded this tournament, these can be spent on tournament prizes throughout the month!`);
					}
					return;
				case 'end':
					if (!(this.canUse(2) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");

					return ChatHandler.send(WIFI_ROOM, `/tour end`);
				case 'leaderboard':
					if (!rest) {
						const leaderboardFormat = await settings.hget(`${WIFI_ROOM}:leaderboard`, 'format');
						if (leaderboardFormat) return this.reply(`The current ranked format is: ${leaderboardFormat}`);
						return this.pmreply("No ranked format set.");
					}
					if (!this.canUse(5)) return this.pmreply("Permission denied.");

					await settings.hset(`${WIFI_ROOM}:leaderboard`, 'format', rest.trim());
					return this.reply(`The ranked format was set to ${rest}`);
				case 'rules':
					if (!rest) {
						const rules = await settings.hget(`${WIFI_ROOM}:leaderboard`, 'rules');
						if (rules) return this.reply(`The current ranked rules are: ${rules}`);
						return this.pmreply("No ranked rules set.");
					}
					if (!this.canUse(5)) return this.pmreply("Permission denied.");

					await settings.hset(`${WIFI_ROOM}:leaderboard`, 'rules', rest.trim());
					return this.reply(`The ranked rules were set to ${rest}`);
				default:
					return this.pmreply(`Unknown command.`);
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
				ChatHandler.send(WIFI_ROOM, `/modnote ${toId(message)} was whitelisted as a tour helper by ${this.username}.`);
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
				ChatHandler.send(WIFI_ROOM, `/modnote ${toId(message)} was unwhitelisted as a tour helper by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
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
				if (userid === this.userid) return this.reply("You cannot give yourself points.");
				if (!userid || !points || points < 0) return this.pmreply("Syntax error. ``.addtp username, amount``");
				userid = toId(userid);

				let db = redis.useDatabase('tours');

				if (!(await db.exists(`${WIFI_ROOM}:${userid}`))) {
					await db.hmset(`${WIFI_ROOM}:${userid}`, 'username', username, 'points', 0, 'total', 0);
				}

				await db.hincrby(`${WIFI_ROOM}:${userid}`, 'points', points);
				await db.hincrby(`${WIFI_ROOM}:${userid}`, 'total', points);
				db.hset(`${WIFI_ROOM}:${userid}`, 'timestamp', Date.now());

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

				const db = redis.useDatabase('tours');
				let keys = await db.keys(`${WIFI_ROOM}:*`);

				let promises = keys.map(async key => {
					const entry = await db.hgetall(key);
					if (entry.points > DECAY_CAP) {
						db.hset(key, 'points', DECAY_CAP);
						this.sendMail('Kid A', key.split(':')[1], `Your tournament points have decayed! You now have ${DECAY_CAP} points.`);
					} else if (entry.timestamp && entry.timestamp + EXPIRATION_TIMER) {
						db.del(key);
						this.sendMail('Kid A', key.split(':')[1], `Your tournament points have expired.`);
					}
					return true;
				});

				await Promise.all(promises);

				ChatHandler.send(WIFI_ROOM, `/modnote ${this.username} reset the tour points.`);
				return this.reply(`Points reset.`);
			},
		},
	},
};
