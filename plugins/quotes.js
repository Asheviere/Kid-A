'use strict';

const fs = require('fs');

const utils = require('../utils.js');
const server = require('../server.js');
const databases = require('../databases.js');

let quotedata;

function loadQuotes() {
	let data;
	try {
		data = require('../data/quotes.json');
	} catch (e) {}

	if (typeof data !== 'object' || Array.isArray(data)) data = {};

	return data;
}

function writeQuotes() {
	let toWrite = JSON.stringify(quotedata);
	fs.writeFileSync('./data/quotes.json', toWrite);
}

databases.addDatabase('quotes', loadQuotes, writeQuotes);
quotedata = databases.getDatabase('quotes');

function generateQuotePage(room) {
	let content = '<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" type="text/css" href="../style.css"><title>' + room + ' - Kid A</title></head><body><div class="container">';
	if (quotedata[room]) {
		content += "<h1>" + room + ' quotes:</h1><div class="quotes">';
		for (let i = 0; i < quotedata[room].length; i++) {
			content += '<p>' + sanitize(quotedata[room][i]) + '</p>';
		}
		content += '</div>';
	}
	return content + '</div></body></html>';
}

function quoteResolver(req, res) {
	let room = req.originalUrl.split('/')[1];
	res.end(generateQuotePage(room));
}

for (let room in quotedata) {
	if (Config.privateRooms.has(room)) continue;
	server.addRoute('/' + room + '/quotes', quoteResolver);
}

module.exports = {
	commands: {
		quote(userstr, room, message) {
			if (!room) return this.pmreply("This command can't be used in PMs.");
			if (!canUse(userstr, 2)) return this.pmreply("Permission denied.");
			if (!message.length) return this.pmreply("Please enter a valid quote.");

			if (!quotedata[room]) {
				quotedata[room] = [];
				if (!Config.privateRooms.has(room)) {
					server.addRoute('/' + room + '/quotes', quoteResolver);
					// Wait 500ms to make sure everything's ready.
					setTimeout(() => server.restart(), 500);
				}
			}

			if (quotedata[room].includes(message)) {
				return this.reply("Quote is already added.");
			}

			quotedata[room].push(message);
			databases.writeDatabase('quotes');
			return this.reply("Quote has been added.");
		},

		quotes(userstr, room) {
			if (!room) return this.pmreply("This command can't be used in PMs.");
			if (!canUse(userstr, 1)) return this.pmreply("Permission denied.");

			if (quotedata[room]) {
				let fname;
				if (Config.privateRooms.has(room)) {
					fname = utils.generateTempFile(generateQuotePage(room), 15, true);
				} else {
					fname = room + "/quotes";
				}
				return this.reply("Quote page: "+ server.url + fname);
			}

			return this.pmreply("This room has no quotes.");
		},

		randquote(userstr, room) {
			if (!room) return this.pmreply("This command can't be used in PMs.");
			if (!canUse(userstr, 1)) return this.pmreply("Permission denied.");

			if (quotedata[room]) {
				return this.reply(quotedata[room][Math.floor(Math.random() * quotedata[room].length)]);
			}

			return this.pmreply("This room has no quotes.");
		},
	},
};
