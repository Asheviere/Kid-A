'use strict';

const redis = require('../redis.js');

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

				if (!(this.canUse(4))) return this.pmreply("Permission denied.");
				let [solution, ...hint] = split;
				if (!(room && solution)) return this.pmreply("Syntax: ``.addhangman room, solution, hint``");

                // Copied from my code from the hangman plugin;
                solution = solution.replace(/[^A-Za-z '-]/g, '').trim();
                if (solution.replace(/ /g, '').length < 1) return this.pmreply("Enter a valid word");
                if (solution.length > 30) return this.pmreply("Phrase must be less than 30 characters.");
                if (solution.split(' ').some(w => w.length > 20)) return this.pmreply("Each word in the phrase must be less than 20 characters.");
                if (!/[a-zA-Z]/.test(solution)) return this.pmreply("Word must contain at least one letter.");

                let output = solution;

                if (hint && hint.length) {
                    hint = hint.join(',').trim();
                    if (hint.length > 150) return this.pmreply("Hint too long.");
                    output += `, ${hint}`;
                }

				await hangman.rpush(room, output);

				Connection.send(`${room}|/modnote ${this.username} added '${solution}' to the list of hangman words.`);
				this.reply("Word successfully added.");
			},
		},
		deletehangman: {
			async action(message) {
                let room = this.room;

                if (!room) {
                    [room, message] = message.split(',');
					if (!this.getRoomAuth(room)) return;
				}

				if (!(this.canUse(4))) return this.pmreply("Permission denied.");
				let solution = toId(message);
                if (!(room && solution)) return this.pmreply("Syntax: ``.deletehangman room, solution``");

                let words = await redis.getList(hangman, room);

				for (let i = 0; i < words.length; i++) {
                    let val = toId(words[i].split(',')[0]);
                    if (solution === val) {
                        if (await hangman.lrem(room, 0, words[i])) {
                            return this.reply("Word successfully deleted.");
                        }
                    }
                }

                this.reply("Word not found.");
			},
		},
		hangman: {
            permission: 1,
			disallowPM: true,
			async action() {
				if (await hangman.exists(this.room)) {
					let words = await redis.getList(hangman, this.room);
					let word = words[Math.floor(Math.random() * words.length)];
					return this.reply(`/hangman new ${word}`);
				}

				return this.pmreply("This room has hangman words.");
			},
		},
	},
};
