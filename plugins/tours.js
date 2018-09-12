'use strict';

const Page = require('../page.js');
const redis = require('../redis.js');
const server = require('../server.js');
const utils = require('../utils.js');

const WIFI_ROOM = 'wifi';

const settings = redis.useDatabase('settings');

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
	return {tourHelpers: (await settings.hvals('whitelist:tourhelpers')).join(', '), data: data};
}

new Page('leaderboard', leaderboardGenerator, 'leaderboard.html', {rooms: [WIFI_ROOM]});

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
					let format = rest;
					let rated = false;
					if (toId(format) === 'leaderboard') {
						const leaderboardFormat = await settings.hget(`${WIFI_ROOM}:leaderboard`, 'format');
						if (!leaderboardFormat) return this.reply("This room doesn't have a leaderboard format set. Set with ``.tour leaderboard``");

						rated = true;
						format = leaderboardFormat;
					}
					ChatHandler.send(WIFI_ROOM, `/tour new ${format}, elimination`);
					ChatHandler.send(WIFI_ROOM, `/tour autostart 5`);
					ChatHandler.send(WIFI_ROOM, `/tour autodq 2`);
					ChatHandler.send(WIFI_ROOM, `/tour forcetimer`);
					if (rated) {
						ChatHandler.send(WIFI_ROOM, `/tour name ${format} Leaderboard Tournament`);
						ChatHandler.send(WIFI_ROOM, `/tour scouting disallow`);
					}
					return;
				case 'leaderboard':
					if (!rest) {
						const leaderboardFormat = await settings.hget(`${WIFI_ROOM}:leaderboard`, 'format');
						if (leaderboardFormat) return this.reply(`The current ranked format is: ${leaderboardFormat}`);
						return this.pmreply("No ranked format set.");
					}
					if (!(this.canUse(5) || await this.settings.hexists('whitelist:tourhelpers', this.userid))) return this.pmreply("Permission denied.");

					await settings.hset(`${WIFI_ROOM}:leaderboard`, 'format', rest.trim());
					return this.reply(`The ranked format was set to ${rest}`);
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
