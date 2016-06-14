'use strict';

const sentiment = require('sentiment');

module.exports = {
	analyzer: {
		parser(room, message) {
			// Don't even bother with messages that are just emoticons.
			if (toId(message).length < 2) return false;

			let smt = sentiment(message);
			if (!smt.words.length) return false;

			if (!Data.data[room]) Data.data[room] = {};
			if (!Data.data[room].sentiment) Data.data[room].sentiment = {score: smt.score, n: 1};

			Data.data[room].sentiment.score = (Data.data[room].sentiment.score + smt.score) / ++Data.data[room].sentiment.n;
		},

		display(room) {
			let roomSentiment = Data.data[room].sentiment;
			return '<p>Average sentiment: ' + (roomSentiment ? roomSentiment.score * 1000 : 0) + '</p>';
		}
	}
};
