'use strict';

const redis = require('../redis');

let hangman = redis.useDatabase('hangman');

module.exports = {
	commands: {
		addhangman: {
			async action(message) {
				let room = this.room;
				let split = message.split(',');
				if (!room) {
					[room, ...split] = split;
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

					await hangman.hmset(`${room}:${toId(solution)}`, 'hint', hint);
				}

				return this.reply("Word successfully added.");
			},
		},

		deletehangman: {
			async action(message) {
				let room = this.room;
				if (!room) {
					[room, message] = message.split(',');
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
	},
};