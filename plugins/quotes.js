var fs = require('fs');

function loadQuotes() {
	var data;
	try {
		data = require('../data/quotes.json');
	} catch (e) {}

	if (!Object.isObject(data)) data = {};

	return data;
}

function writeQuotes() {
	var toWrite = JSON.stringify(Data.quotes);
	fs.writeFileSync('./data/quotes.json', toWrite);
}

Databases.addDatabase('quotes', loadQuotes, writeQuotes);

function quoteResolver(req, res) {
	var room = req.originalUrl.split('/')[1];
	var content = '<!DOCTYPE html><html><head><link rel="stylesheet" type="text/css" href="style.css"><title>' + room + ' - Kid A</title></head><body>';
	if (Data.quotes[room]) {
		for (var i = 0; i < Data.quotes[room].length; i++) {
			content += Data.quotes[room][i] + '<br/>';
		}
	}
	content += '</body></html>';
	res.end(content);
}

for (var room in Data.quotes) {
	Server.addPage('/' + room + '/quotes', quoteResolver);
}

module.exports = {
	commands: {
		quote: function (userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};
			if (!message.length) return {pmreply: "Please enter a valid quote."};

			var quote = sanitize(message);

			if (!Data.quotes[room]) {
				Data.quotes[room] = [];
				Server.addPage('/' + room + '/quotes', quoteResolver);
				// Wait 500ms to make sure everything's ready.
				setTimeout(() => Server.restart(), 500);
			};

			if (Data.quotes[room].indexOf(quote) > -1) {
				return {reply: "Quote is already added."};
			}

			Data.quotes[room].push(quote);
			Databases.writeDatabase('quotes');
			return {reply: "Quote has been added."};
		},
		quotes: function (userstr, room) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			if (Data.quotes[room]) {
				return {reply: "Quote page: "+ Server.url + room + "/quotes"};
			} else {
				return {pmreply: "This room has no quotes."};
			}
		},
		randquote: function (userstr, room) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			if (Data.quotes[room]) {
				return Data.quotes[room][Math.floor(Math.random() * Data.quotes[room].length)];
			} else {
				return {pmreply: "This room has no quotes."};
			}
		}
	}
};
