var profanityList = [
	'fuck', 'fucking', 'motherfucking', 'motherfucker', 'bitch', 'shit', 'shitting', 'cock', 'dick', 'pussy', 'roastie', 'cunt',
	'autist', 'aspie', 'retard', 'cuck', 'cuckold', 'whore',
	'nigger', 'fag', 'faggot', 'meanie', 'poopyhead', 'kike', 'spic', 'sandnigger', 'pinoy', 'nigga', 'mexican',
	'tymp', 'tympy', 'tympani'
];

module.exports = {
	analyzer: {
		parser: function(room, message) {
			// Don't even bother with messages that are just emoticons.
			if (toId(message).length < 2) return false;

			var words = message.split(' ');

			var profanities = 0;
			for (var i = 0; i < words.length; i++) {
				if (profanityList.indexOf(toId(words[i])) > -1) {
					profanities++;
				}
			}

			if (!Data.data[room]) Data.data[room] = {};
			if (!Data.data[room].profanities) {
				Data.data[room].profanities = {count: profanities, total: words.length};
			} else {
				Data.data[room].profanities.count += profanities;
				Data.data[room].profanities.total += words.length;
			}
		},

		display: room => 'Percentage of words said that are swear words: ' + (Data.data[room].profanities ? Data.data[room].profanities.count / Data.data[room].profanities.total * 100 : 0),
	}
}
