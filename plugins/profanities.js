'use strict';

const PROFANITY_LIST = new Set([
	'fuck', 'fucking', 'motherfucking', 'motherfucker', 'bitch', 'shit', 'shitting', 'cock', 'dick', 'pussy', 'roastie', 'cunt',
	'autist', 'aspie', 'retard', 'cuck', 'cuckold', 'whore',
	'nigger', 'fag', 'faggot', 'meanie', 'poopyhead', 'kike', 'spic', 'sandnigger', 'pinoy', 'nigga', 'mexican',
	'tymp', 'tympy', 'tympani',
]);

module.exports = {
	analyzer: {
		parser(room, message) {
			// Don't even bother with messages that are just emoticons.
			if (toId(message).length < 2) return false;

			let words = message.split(' ');

			let profanities = message.split(' ').reduce((tally, word) => {
				if (PROFANITY_LIST.has(toId(word))) return ++tally;
				return tally;
			}, 0);

			if (!Data.data[room]) Data.data[room] = {};
			if (!Data.data[room].profanities) {
				Data.data[room].profanities = {count: profanities, total: words.length};
			} else {
				Data.data[room].profanities.count += profanities;
				Data.data[room].profanities.total += words.length;
			}
		},

		display(room) {
			let profanities = Data.data[room] && Data.data[room].profanities;
			return '<p>Percentage of words said that are swear words: ' + (profanities ? (profanities.count / profanities.total * 100) : 0) + '</p>';
		},
	},
};
