'use strict';

const fs = require('fs');

const server = require('../server.js');

function loadQuotes() {
	let data;
	try {
		data = require('../data/quotes.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeQuotes() {
	let toWrite = JSON.stringify(Data.quotes);
	fs.writeFileSync('./data/quotes.json', toWrite);
}

Databases.addDatabase('quotes', loadQuotes, writeQuotes);

function quoteResolver(req, res) {
	let room = req.originalUrl.split('/')[1];
	let content = '<!DOCTYPE html><html><head><link rel="stylesheet" type="text/css" href="../style.css"><title>' + room + ' - Kid A</title></head><body><div class="container">';
	if (Data.quotes[room]) {
		content += "<h1>" + room + ' quotes:</h1><div class="quotes">';
		for (let i = 0; i < Data.quotes[room].length; i++) {
			content += '<p>' + sanitize(Data.quotes[room][i]) + '</p>';
		}
		content += '</div>';
	}
	content += '</div></body></html>';
	res.end(content);
}

for (let room in Data.quotes) {
	server.addRoute('/' + room + '/quotes', quoteResolver);
}

module.exports = {
	commands: {
		quote(userstr, room, message) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};
			if (!message.length) return {pmreply: "Please enter a valid quote."};

			if (!Data.quotes[room]) {
				Data.quotes[room] = [];
				server.addRoute('/' + room + '/quotes', quoteResolver);
				// Wait 500ms to make sure everything's ready.
				setTimeout(() => server.restart(), 500);
			}

			if (Data.quotes[room].includes(message)) {
				return {reply: "Quote is already added."};
			}

			Data.quotes[room].push(message);
			Databases.writeDatabase('quotes');
			return {reply: "Quote has been added."};
		},

		quotes(userstr, room) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			if (Data.quotes[room]) {
				return {reply: "Quote page: "+ server.url + room + "/quotes"};
			}

			return {pmreply: "This room has no quotes."};
		},

		randquote(userstr, room) {
			if (!room) return {pmreply: "This command can't be used in PMs."};
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};

			if (Data.quotes[room]) {
				return {reply: Data.quotes[room][Math.floor(Math.random() * Data.quotes[room].length)]};
			}

			return {pmreply: "This room has no quotes."};
		},
	},
};
