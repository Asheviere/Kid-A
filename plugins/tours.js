'use strict';

const EventEmitter = require('events');

const Page = require('../page.js');
const redis = require('../redis.js');

const DECAY_CAP = 50;
const EXPIRATION_TIMER = 2 * 30 * 24 * 60 * 60 * 1000;
const CURRENCY_NAME = 'Arbitrary Points';
const LEFT_COLUMN = ['Points to Spend', 'Current Points'];

const TOURS = {
	simple: [
		['gen7randombattle'], ['gen7randombattle'], ['gen7ou'], ['gen7ou'], ['gen7uu'], ['gen7pu'], ['gen7monotype'], ['gen7anythingoes'], ['gen7ubers'], ['gen7battlespotsingles'], ['gen7doublesou'],
	],
	random: [
		['gen7randombattle'], ['gen7battlefactory'], ['gen7bssfactory'], ['gen7monotyperandombattle'], ['gen7challengecup1v1'], ['gen7challengecup2v2'], ['gen7hackmonscup'], ['gen7doubleshackmonscup'], ['gen6randombattle'], ['gen6battlefactory'], ['gen5randombattle'], ['gen4randombattle'], ['gen3randombattle'], ['gen2randombattle'], ['gen1randombattle'], ['gen1challengecup'],
	],
	crazy: [
		['gen7monotyperandombattle', 'inversemod', 'Inverse Monotype Randbats'],
		['gen7hackmonscup', 'inversemod', 'Inverse Hackmons Cup'],
		['gen7randomdoublesbattle', 'inversemod', 'Inverse Doubles Randbats'],
		['gen7ou', 'inversemod', 'Inverse OU'],
		['gen7metronomebattle', 'inversemod', 'Inverse Metronome Battles'],
		['gen7metronomebattle'],
		['gen7battlefactory', 'inversemod', 'Inverse Battle Factory'],
		['gen7bssfactory', 'inversemod', 'Inverse BSS Factory'],
		['gen7challengecup1v1', '/tours rules inversemod', 'Inverse Challenge Cup 1v1'],
		['ubers', '-lc, -pu, -nfe, -zu, -ou, -uber, -uu, -ru, -nu, -lc, -mega, +kangaskhan, +metagross, +abomasnow, +absol, +aerodactyl, +aggron, +alakazam, +altaria, +ampharos, +audino, +banette, +beedrill, +blastoise, +blaziken, +camerupt, +charizard, +diancie, +gallade, +garchomp, +gardevoir, +gengar, +glalie, +gyarados, +heracross, +houndoom, +latias, +latios, +lopunny, +lucario, +manectric, +mawile, +medicham, +mewtwo, +pidgeot, +pinsir, +sableye, +rayquaza, +salamence, +sceptile, +scizor, +sharpedo, +slowbro, +swampert, +steelix, +tyranitar, +venusaur, +crucibelle', 'Mega-no-Mega', 'Every single Pokemon that can Mega evolve can be used, except mega evolution is banned!'],
		['ubers', '-uber, -ou, -uu, -ru, -nu, -pu, -zu, -lc, -nfe, +arceus, itemclause, !speciesclause', 'Arceus Only!', 'Only Arceus can be used for this tournament!'],
		['customgame', '-zu, -pu, -ru, -nu, -uu, -ou, -uber, -rayquazamega, -red orb, -blue orb, +kyogre, +groudon, +blacephalon, +ferrothorn, +magnezone, +swampert, +heracross, +venusaur, +aggron, +krookodile, +nidoking, +tentacruel, +bewear, +glalie, +steelix, +tyrantrum, +exploud, +slurpuff, +accelgor, +hariyama, +claydol, +bastiodon, +kabutops, +beheeyem, +bouffalant, +carnivine, +drifblim, +gourgeist, +slaking, +wailmer, +wailord, +colossoil, +reuniclus, +primeape, +spinda, +feraligatr, +swampertmega, +glaliemega, +heracrossmega, +steelixmega, +aggronmega, +venusaurmega, -cap, !sleepclause, +weezing, +koffing, +metagross, +metagrossmega, -primalkyogre, -primalgroudon', 'Big Heads Only!', 'Big Head-ed Pokemon only! Here is a list of all the Pokemon valid for this tournament: https://pastebin.com/8pTHNrct'],
	],
};

const settings = redis.useDatabase('settings');

async function getCurrencyName(room) {
	const name = await settings.hget(`${room}:leaderboard`, 'currency');
	return name || CURRENCY_NAME;
}

async function leaderboardGenerator(room) {
	let db = redis.useDatabase('tours');
	let keys = await db.keys(`${room}:*`);
	let data = [];
	const currency = await getCurrencyName(room);
	const shop = await settings.hget(`${room}:leaderboard`, 'shop');
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
	return {tourHelpers: (await settings.hvals(`${room}:tourhelpers`)).join(', '), data: data, currency: currency, leftcolumn: LEFT_COLUMN[(shop ? 0 : 1)]};
}

const leaderboard = new Page('leaderboard', leaderboardGenerator, 'leaderboard.html');

const listener = new EventEmitter();

listener.on('update', (roomid, data) => {
	if (!data.bracketData || data.bracketData.type !== 'tree') return;
	if (data.bracketData.rootNode && data.bracketData.rootNode.state === 'inprogress' && data.bracketData.rootNode.room) {
		const doubleElim = data.bracketData.rootNode.children[0] && data.bracketData.rootNode.children[1].children[0] && data.bracketData.rootNode.children[1] &&
			(data.bracketData.rootNode.children[1].children[1].children[0] && !data.bracketData.rootNode.children[1].children[0].children[0]);
		if (doubleElim) {
			ChatHandler.send(roomid, `/wall ${data.bracketData.rootNode.children[0].team} is on match point! <<${data.bracketData.rootNode.room}>>`);
		} else {
			ChatHandler.send(roomid, `/wall Watch the finals of the tournament! <<${data.bracketData.rootNode.room}>>`);
		}
	}
});

listener.on('end', async (roomid, data) => {
	if (data.generator === 'Round Robin') return; // This is currently not supported.
	const options = await settings.lrange(`${roomid}:options`, 0, -1);
	if (!(toId(data.format).includes('leaderboard') || options.includes('autopoints'))) return; // TODO: better way to determine whether to give points for the tour.
	let finalist1 = data.bracketData.rootNode.children[0].team;
	let finalist2 = data.bracketData.rootNode.children[1].team;
	let winner = data.bracketData.rootNode.result === 'win' ? finalist1 : finalist2;
	let runnerup = winner === finalist1 ? finalist2 : finalist1;
	let semifinalists = data.bracketData.rootNode.children[0].children.map(val => val.team).concat(data.bracketData.rootNode.children[1].children.map(val => val.team)).filter(name => ![finalist1, finalist2].includes(name));

	// Get the list of players to determine amount of prize points.
	const getPlayers = node => node.children && node.children.length ? getPlayers(node.children[0]).concat(getPlayers(node.children[1])) : [node.team];
	const players = getPlayers(data.bracketData.rootNode);
	let rounds = Math.floor(Math.log2(players.length));

	// If more than half of the players has to play another game, round up.
	if (players.length * 1.5 > 2 ** (rounds + 1)) rounds++;

	// 1 point per round for top 4, plus an additional 1 point for the winner for every round past 4. 2 people tours don't count. 1 more point per round in rooms with less than 50 users.
	let prizes = [rounds - 1, rounds - 2, rounds - 3];
	if (prizes[1] < 0) prizes[1] = 0;
	if (prizes[2] < 0) prizes[2] = 0;
	if (rounds > 5) prizes[0] += rounds - 4;
	if (Object.keys(ChatHandler.userlists[roomid]).length < 50) {
		prizes = prizes.map(prize => prize++);
	}

	const currency = await getCurrencyName(roomid);

	ChatHandler.send(roomid, `/wall Winner: ${winner} (${prizes[0]}${Utils.abbreviate(currency)}). Runner-up: ${runnerup} (${prizes[1]}${Utils.abbreviate(currency)})${semifinalists.length ? `. Semi-finalists: ${semifinalists.join(', ')} (${prizes[2]}${Utils.abbreviate(currency)})` : ''}`);

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

		ChatHandler.send(roomid, `/wall Quarterfinalists (1${Utils.abbreviate(currency)}): ${top8.join(', ')}`);
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
	options: [['disabletours', "Disable tournaments plugin"],
			  ['autopoints', "Automatically award points for any tour"]],

	async init() {
		let rooms = await ChatLogger.getRooms();

		for (let i = 0; i < rooms.length; i++) {
			leaderboard.addRoom(rooms[i]);
		}
	},
	tours: {
		listener: listener,
	},
	commands: {
		tour: {
			requireRoom: true,
			async action(message) {
				let [cmd, ...rest] = message.split(' ');
				rest = rest.join(' ');
				let format = rest;
				let rated = false;
				let rules = '';
				let name = '';
				let announcement = '';

				switch (cmd) {
				case 'alias':
					if (!this.canUse(2)) return this.pmreply("Permission denied.");

					let [alias, ...text] = rest.split(',');
					text = `${text.join(',').trim()}|${alias}`;
					alias = toId(alias);

					await this.settings.hset(`${this.room}:touraliases`, alias, text);
					ChatHandler.send(this.room, `/modnote tour alias '${alias}' => '${text}' was set by ${this.username}.`);
					return this.reply(`Alias created: '${alias}' => '${text}'`);
				case 'deletealias':
					let toDelete = toId(rest);

					if (!(await this.settings.hdel(`${this.room}:touraliases`, toDelete))) {
						return this.reply("Cannot delete alias.");
					}
					ChatHandler.send(this.room, `/modnote tour alias '${alias}' was deleted by ${this.username}.`);
					return this.reply(`Alias deleted: ${toDelete}`);
				case 'simple':
				case 'random':
				case 'crazy':
					[format, rules, name, announcement] = TOURS[cmd][Math.floor(Math.random() * TOURS[cmd].length)];
				case 'leaderboard':
				case 'new':
				case 'create':
					if (!(this.canUse(2) || await this.settings.hexists(`${this.room}:tourhelpers`, this.userid))) return this.pmreply("Permission denied.");
					if (cmd === 'leaderboard') {
						const {format: leaderboardFormat, rules: leaderboardRules, name: leaderboardName} = await settings.hgetall(`${this.room}:leaderboard`);
						if (!leaderboardFormat) return this.reply("This room doesn't have a leaderboard format set. Set with ``.tour leaderboard``");

						rated = true;
						format = leaderboardFormat;
						rules = leaderboardRules || '';
						name = `${leaderboardName || format} Leaderboard`;
					} else if (this.options.includes('autopoints')) {
						rated = true;
					}

					if (rated) {
						const currency = await getCurrencyName(this.room);
						const shop = await this.settings.hget(`${this.room}:leaderboard`, 'shop');
						announcement = `${currency} will be awarded this tournament${shop ? `, these can be spent on prizes throughout the month!` : ''}`;
					}

					let isAlias = await this.settings.hget(`${this.room}:touraliases`, toId(rest));

					if (isAlias) {
						[format, rules, name] = isAlias.split('|').map(param => param.trim());
					}

					ChatHandler.send(this.room, `/tour new ${format}, elimination`);
					ChatHandler.send(this.room, `/tour autostart 5`);
					ChatHandler.send(this.room, `/tour autodq 2`);
					ChatHandler.send(this.room, `/tour forcetimer`);

					if (name) ChatHandler.send(this.room, `/tour name ${name}`);
					if (rules) ChatHandler.send(this.room, `/tour rules ${rules}`);
					if (rated) {
						ChatHandler.send(this.room, `/tour scouting disallow`);
					}
					if (announcement) ChatHandler.send(this.room, `/wall ${announcement}`);
					return;
				case 'end':
					if (!(this.canUse(2) || await this.settings.hexists(`${this.room}:tourhelpers`, this.userid))) return this.pmreply("Permission denied.");

					return ChatHandler.send(this.room, `/tour end`);
				case 'setname':
					if (!(this.canUse(2) || await this.settings.hexists(`${this.room}:tourhelpers`, this.userid))) return this.pmreply("Permission denied.");

					ChatHandler.send(this.room, `/tour name ${rest}`);
				case 'set':
					let setting;
					[setting, ...rest] = rest.split(',');
					setting = setting.trim();
					rest = rest.join(',').trim();
					switch (setting) {
					case 'leaderboard':
						if (!rest) {
							const leaderboardFormat = await settings.hget(`${this.room}:leaderboard`, 'format');
							if (leaderboardFormat) return this.reply(`The current ranked format is: ${leaderboardFormat}`);
							return this.pmreply("No ranked format set.");
						}
						if (!this.canUse(5)) return this.pmreply("Permission denied.");

						await settings.hset(`${this.room}:leaderboard`, 'format', rest.trim());
						return this.reply(`The ranked format was set to ${rest}`);
					case 'rules':
						if (!rest) {
							const rules = await settings.hget(`${this.room}:leaderboard`, 'rules');
							if (rules) return this.reply(`The current ranked rules are: ${rules}`);
							return this.pmreply("No ranked rules set.");
						}
						if (!this.canUse(5)) return this.pmreply("Permission denied.");

						await settings.hset(`${this.room}:leaderboard`, 'rules', rest.trim());
						return this.reply(`The ranked rules were set to ${rest}`);
					case 'shop':
						if (!rest) {
							const shop = await settings.hget(`${this.room}:leaderboard`, 'shop');
							return this.reply(`This room is ${shop ? '' : 'not'} marked as having a shop.`);
						}
						if (!this.canUse(5)) return this.pmreply("Permission denied.");

						await settings.hset(`${this.room}:leaderboard`, 'shop', rest === 'on');
						return this.reply(`The scoreboard was marked as ${rest === 'on' ? '' : 'not'} having a shop.`);
					case 'name':
						if (!rest) {
							const name = await settings.hget(`${this.room}:leaderboard`, 'name');
							if (name) return this.reply(`The current leaderboard format name is: ${name}`);
							return this.pmreply("No leaderboard format name set.");
						}
						if (!this.canUse(5)) return this.pmreply("Permission denied.");

						await settings.hset(`${this.room}:leaderboard`, 'name', rest.trim());
						return this.reply(`The room's leaderboard name was set to ${rest.trim()}`);
					case 'currency':
						if (!rest) {
							const currency = await getCurrencyName(this.room);
							return this.reply(`This room's currency is called ${currency} (${Utils.abbreviate(currency)})`);
						}
						if (!this.canUse(5)) return this.pmreply("Permission denied.");

						await settings.hset(`${this.room}:leaderboard`, 'currency', rest.trim());
						return this.reply(`The room's currency was set to ${rest} (${Utils.abbreviate(rest)})`);
					default:
						return this.pmreply(`Unknown setting: ${setting}`);
					}
				default:
					return this.pmreply(`Unknown command.`);
				}
			},
		},
		whitelisttourhelper: {
			requireRoom: true,
			async action(message) {
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				if (await this.settings.hexists(`${this.room}:tourhelpers`, toId(message))) return this.reply("This user is already whitelisted.");

				await this.settings.hset(`${this.room}:tourhelpers`, toId(message), message);
				ChatHandler.send(this.room, `/modnote ${toId(message)} was whitelisted as a tour helper by ${this.username}.`);
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelisttourhelper: {
			requireRoom: true,
			async action(message) {
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				if (!await this.settings.hexists(`${this.room}:tourhelpers`, toId(message))) return this.reply("This user isn't whitelisted.");

				await this.settings.hdel(`${this.room}:tourhelpers`, toId(message));
				ChatHandler.send(this.room, `/modnote ${toId(message)} was unwhitelisted as a tour helper by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		points: {
			aliases: ['tp'],
			requireRoom: true,
			permission: 1,
			async action(message) {
				if (!message) message = this.userid;
				message = toId(message);

				let db = redis.useDatabase('tours');
				const currency = await getCurrencyName(this.room);

				const points = await db.hget(`${this.room}:${message}`, 'points');

				if (!points) return this.reply(`${message === this.userid ? `You don't` : `${message} doesn't`} have any ${currency}.`);
				return this.reply(`${message === this.userid ? `You have` : `${message} has`} ${points} ${currency}.`);
			},
		},
		addpoints: {
			aliases: ['addtp'],
			requireRoom: true,
			async action(message) {
				if (!(this.canUse(2) || await this.settings.hexists(`${this.room}:tourhelpers`, this.userid))) return this.pmreply("Permission denied.");

				let [username, points] = message.split(',').map(param => param.trim());
				points = parseInt(points);
				let userid = toId(username);
				if (userid === this.userid) return this.reply("You cannot give yourself points.");
				if (!userid || !points || points < 0) return this.pmreply("Syntax error. ``.addpoints username, amount``");
				userid = toId(userid);

				let db = redis.useDatabase('tours');
				const currency = await getCurrencyName(this.room);

				if (!(await db.exists(`${this.room}:${userid}`))) {
					await db.hmset(`${this.room}:${userid}`, 'username', username, 'points', 0, 'total', 0);
				}

				await db.hincrby(`${this.room}:${userid}`, 'points', points);
				await db.hincrby(`${this.room}:${userid}`, 'total', points);
				db.hset(`${this.room}:${userid}`, 'timestamp', Date.now());

				return this.reply(`${points} ${currency} added for ${username}.`);
			},
		},
		removepoints: {
			aliases: ['removetp'],
			requireRoom: true,
			async action(message) {
				if (!(this.canUse(2) || await this.settings.hexists(`${this.room}:tourhelpers`, this.userid))) return this.pmreply("Permission denied.");

				let [username, points, total] = message.split(',').map(param => param.trim());
				points = parseInt(points);
				if (total) total = toId(total);
				let removeFromTotal = parseInt(total);
				let userid = toId(username);
				if (!userid || !(points || removeFromTotal) || points < 0) return this.pmreply("Syntax error. ``.removetp username, amount, remove from total``");
				userid = toId(userid);

				let db = redis.useDatabase('tours');
				let entry = await db.hgetall(`${this.room}:${userid}`);
				const currency = await getCurrencyName(this.room);

				if (!entry) return this.reply(`This person doesn't have any ${currency}.`);
				if (!removeFromTotal && (total === 'true' || total === 'yes')) removeFromTotal = points;

				if (entry.points < points) return this.reply(`This user doesn't have ${points}${Utils.abbreviate(currency)}. You can only remove ${entry.points}${Utils.abbreviate(currency)}.`);
				if (entry.total < removeFromTotal) return this.reply(`This user doesn't have ${removeFromTotal}${Utils.abbreviate(currency)} total. You can only remove ${entry.total}${Utils.abbreviate(currency)}.`);

				await db.hincrby(`${this.room}:${userid}`, 'points', -1 * points);
				if (removeFromTotal) await db.hincrby(`${this.room}:${userid}`, 'total', -1 * removeFromTotal);

				return this.reply(`${points} ${currency} removed from ${username}${removeFromTotal ? ` and ${removeFromTotal} total ${currency}` : ''}.`);
			},
		},
		resetpoints: {
			aliases: ['resettp'],
			requireRoom: true,
			async action(message) {
				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				const db = redis.useDatabase('tours');
				let keys = await db.keys(`${this.room}:*`);
				const currency = await getCurrencyName(this.room);
				const hard = toId(message) === 'hard';

				let promises = keys.map(async key => {
					const entry = await db.hgetall(key);
					if (hard) {
						db.hset(key, 'points', 0);
						this.sendMail('Kid A', key.split(':')[1], `Your ${currency} in ${this.room} has been reset.`);
					} else if (entry.points > DECAY_CAP) {
						db.hset(key, 'points', DECAY_CAP);
						this.sendMail('Kid A', key.split(':')[1], `Your ${currency} in ${this.room} have decayed! You now have ${DECAY_CAP} points.`);
					} else if (!entry.timestamp || entry.timestamp + EXPIRATION_TIMER < Date.now()) {
						db.del(key);
						this.sendMail('Kid A', key.split(':')[1], `Your ${currency} ${this.room} have expired.`);
					}
					return true;
				});

				await Promise.all(promises);

				ChatHandler.send(this.room, `/modnote ${this.username} reset the ${currency}.`);
				return this.reply(`Points reset.`);
			},
		},
	},
};
