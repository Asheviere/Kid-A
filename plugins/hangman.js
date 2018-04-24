'use strict';

const redis = require('../redis');
const Page = require('../page.js');
const server = require('../server.js');

let hangman = redis.useDatabase('hangman');

let hangmanPage = new Page('hangman', hangmanGenerator, 'hangman.html', {token: 'hangman', postHandler: editHangmans});

async function editHangmans(data, room) {
	let keys = await hangman.keys(`${room}:*`);

	let deletes = keys.filter(key => data.includes(key));

	if (deletes.length) {
		hangman.del.apply(hangman, deletes);
	}
}

async function hangmanGenerator(room) {
	let data = {};

	let keys = await hangman.keys(`${room}:*`);
	for (let key of keys) {
		data[key] = (await hangman.hgetall(key));
	}

	return {room: room, data: data};
}

const rooms = new Set();

module.exports = {
	async init() {
		let keys = await hangman.keys("*");
		for (let key of keys) {
			let room = key.split(":")[0];
			rooms.add(key.split(":")[0]);
			hangmanPage.addRoom(room);
		}
	},
	commands: {
		addhangman: {
			async action(message) {
				let room = this.room;
				let split = message.split(',');
				if (!room) {
					[room, ...split] = split;
					room = toId(room);
					if (!this.userlists[room]) return this.pmreply("Unknown room.");
					if (!this.getRoomAuth(room)) return;
				}

				if (!this.canUse(3)) return this.pmreply("Permission denied.");
				let [solution, ...hint] = split;
				if (!(room && solution)) return this.pmreply("Syntax: ``.addhangman room, solution, hint``");

				// Copied from my code from the hangman plugin
				solution = solution.replace(/[^A-Za-z '-]/g, '').trim();
				if (solution.replace(/ /g, '').length < 1) return this.pmreply("Enter a valid word.");
				if (solution.length > 30) return this.pmreply("Phrase must be 30 characters or less.");
				if (solution.split(' ').some(w => w.length > 20)) {
					return this.pmreply("Each word in the phrase must be 20 characters or less.");
				}
				if (!/[a-zA-Z]/.test(solution)) return this.pmreply("Word must contain at least one letter.");

				await hangman.hmset(`${room}:${toId(solution)}`, 'solution', solution, 'addedBy', this.username);

				if (hint && hint.length) {
					hint = hint.join(',').trim();
					if (hint.length > 150) return this.pmreply("The hint cannot exceed 150 characters.");

					await hangman.hset(`${room}:${toId(solution)}`, 'hint', hint);
				}

				if (!rooms.has(room)) {
					rooms.add(room);
					hangmanPage.addRoom(room);
					setTimeout(() => server.restart(), 500);
				}

				return this.reply("Word successfully added.");
			},
		},

		deletehangman: {
			async action(message) {
				let room = this.room;
				if (!room) {
					[room, message] = message.split(',');
					room = toId(room);
					if (!this.userlists[room]) return this.pmreply("Unknown room.");
					if (!this.getRoomAuth(room)) return;
				}

				if (!this.canUse(3)) return this.pmreply("Permission denied.");
				let solution = toId(message);
				if (!(room && solution)) return this.pmreply("Syntax: ``.deletehangman room, solution``");

				if (await hangman.exists(`${room}:${solution}`)) {
					await hangman.del(`${room}:${solution}`);
					return this.reply("Word successfully deleted.");
				}

				return this.reply("Word not found.");
			},
		},

		hangman: {
			permission: 1,
			async action() {
				let words = await hangman.keys(`${this.room}:*`);

				if (words.length) {
					let word = words[Math.floor(Math.random() * words.length)];
					let entry = await hangman.hgetall(word);

					this.reply(`/hangman new ${entry.solution}, ${entry.hint}`);
					return this.reply("/wall Use ``/guess`` to guess!");
				}

				return this.reply("This room has no hangman words.");
			},
		},

		checkhangman: {
			async action(message) {
				let room = this.room;
				if (!room) {
					[room, message] = message.split(',');
					if (!this.getRoomAuth(room)) return;
				}

				if (!this.canUse(3)) return this.pmreply("Permission denied.");
				let solution = toId(message);
				if (!(room && solution)) return this.pmreply("Syntax: ``.checkhangman room, solution``");

				if (await hangman.exists(`${room}:${solution}`)) {
					let addedBy = await hangman.hget(`${room}:${solution}`, 'addedBy');
					return this.reply(`This word was added by ${addedBy}.`);
				}

				return this.reply("Word not found.");
			},
		},

		viewhangman: {
			hidden: true,
			async action(message) {
				let room = this.room;
				if (!room) {
					if (message) {
						room = toId(message);
						if (!this.getRoomAuth(room)) return;
					} else {
						return this.pmreply("No room supplied.");
					}
				}
				if (!this.canUse(3)) return this.pmreply("Permission denied.");

				if (rooms.has(room)) {
					return this.pmreply(`Hangman words for this room: ${hangmanPage.getUrl(room, this.userid)}`);
				}

				this.reply("This room has no hangman words.");
			},
		},
	},
};

