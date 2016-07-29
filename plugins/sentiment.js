'use strict';

const sentiment = require('sentiment');

const databases = require('../databases.js');
const db = databases.getDatabase('data');

module.exports = {
	analyzer: {
		parser(room, message) {
			// Don't even bother with messages that are just emoticons.
			if (toId(message).length < 2) return false;

			let smt = sentiment(message);
			if (!smt.words.length) return false;

			if (!db[room]) db[room] = {};
			if (!db[room].sentiment) db[room].sentiment = {score: smt.score, n: 1};

			db[room].sentiment.score = (db[room].sentiment.score + smt.score) / ++db[room].sentiment.n;
		},

		display(room) {
			let roomSentiment = db[room].sentiment;
			return '<p>Average sentiment: ' + (roomSentiment ? roomSentiment.score * 1000 : 0) + '</p>';
		},
	},
};
