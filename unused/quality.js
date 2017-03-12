'use strict';

const databases = require('../databases.js');
const db = databases.getDatabase('data');

const TWITCH_EMOTES = new Set(['Kappa', 'KappaPride', 'EleGiggle', 'PogChamp', 'BibleThump', 'BrokeBack',
						'DansGame', 'FailFish', 'Keepo', 'Kreygasm', 'OpieOP', 'PJSalt', 'ResidentSleeper',
						'TriHard', 'ANELE', 'NotLikeThis', 'LUL', 'FeelsBadMan']);

const GENERALLY_BAD = new Set(['hitler', 'xd', 'n_n', '^_^', 'trump']);

const AWFUL_MEMES = ['deez nuts', 'john cena', 'allahu akbar', 'o shit waddup', 'dat boi'];

const GOOD_WORDS = new Set(['thanks']);

const GOOD_PHRASES = ['thank you', 'i agree', 'i disagree'];

module.exports = {
	analyzer: {
		parser(room, message) {
			let score = 0;
			let lower = message.toLowerCase();

			// Long messages
			if (message.length > 100) score += 1;

			// Correct punctuation
			if (/[A-Z].+[\.\?\!]/.test(message)) score += 5;

			for (let i = 0; i < AWFUL_MEMES.length; i++) {
				if (lower.includes(AWFUL_MEMES[i])) score -= 20;
			}

			for (let i = 0; i < GOOD_PHRASES.length; i++) {
				if (lower.includes(GOOD_PHRASES[i])) score += 4;
			}

			let words = message.split(' ');

			for (let i = 0; i < words.length; i++) {
				let word = words[i];
				if (TWITCH_EMOTES.has(word)) score -= 3;
				if (GENERALLY_BAD.has(word.toLowerCase())) score -= 2;
				if (GOOD_WORDS.has(word.toLowerCase())) score += 2;
			}

			if (!db[room]) db[room] = {};
			if (!db[room].quality) db[room].quality = 0;
			db[room].quality += score;
		},

		display(room) {
			let quality = db[room] && db[room].quality;
			return '<p>Quality of this room\'s discussion: ' + (quality || 0) + '</p>';
		},
	},
};
