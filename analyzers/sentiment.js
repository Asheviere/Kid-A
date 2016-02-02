var sentiment = require('sentiment');

module.exports = {
	parser: function(room, message) {
		// Don't even bother with messages that are just emoticons.
		if (toId(message).length < 2) return false;

		var smt = sentiment(message);

		if (!smt.words.length) return false;

		if (!Data[room]) Data[room] = {};
		if (!Data[room].sentiment) Data[room].sentiment = {score: smt.score, n: 1};

		Data[room].sentiment.score = (Data[room].sentiment.score + smt.score) / ++Data[room].sentiment.n;

		Handler.writeData();
	},

	display: room => 'Average sentiment: ' + (Data[room].sentiment ? Data[room].sentiment.score * 1000 : 0),
}
