'use strict';

const fs = require('fs');

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

server.addTemplate('quotes', 'quotes.html');

function editQuotes(data, room) {
	let {delete: toDelete, edits: toEdit} = data;

	let newQuotes = [];

	for (let i = 0; i < quotedata[room].length; i++) {
		if (toDelete) {
			if (toDelete.includes(i.toString())) continue;

			if (i in toEdit) {
				newQuotes.push(toEdit[i]);
			} else {
				newQuotes.push(quotedata[room][i]);
			}
		}
	}

	quotedata[room] = newQuotes;
	databases.writeDatabase('quotes');
}

function quoteResolver(req, res) {
	let room = req.originalUrl.split('/')[1];
	let query = server.parseURL(req.url);
	let token = query.token;
	if (!token && Config.privateRooms.has(room)) return res.end('Private Room quotes require an access token to be viewed.');
	if (token) {
		let data = server.getAccessToken(token);
		if (!data) return res.end('Invalid access token.');
		if (data.room === room && data.permission === 'quotes') {
			if (req.method === "POST") {
				if (!(req.body && req.body.data)) return res.end("Malformed request.");
				let data;
				try {
					data = JSON.parse(decodeURIComponent(req.body.data));
				} catch (e) {
					return res.end("Malformed JSON.");
				}
				editQuotes(data, room);
			}
			return res.end(server.renderTemplate('quotes', {room: room, data: quotedata[room], permission: true}));
		}
	}
	res.end(server.renderTemplate('quotes', {room: room, data: quotedata[room]}));
}

for (let room in quotedata) {
	server.addRoute('/' + room + '/quotes', quoteResolver);
}

module.exports = {
	commands: {
		quote: {
			permission: 2,
			disallowPM: true,
			action(message) {
				if (!message.length) return this.pmreply("Please enter a valid quote.");

				if (!quotedata[this.room]) {
					quotedata[this.room] = [];
					if (!Config.privateRooms.has(this.room)) {
						server.addRoute('/' + this.room + '/quotes', quoteResolver);
						// Wait 500ms to make sure everything's ready.
						setTimeout(() => server.restart(), 500);
					}
				}

				if (quotedata[this.room].includes(message)) {
					return this.reply("Quote is already added.");
				}

				quotedata[this.room].push(message);
				databases.writeDatabase('quotes');
				return this.reply("Quote has been added.");
			},
		},

		deletequote: {
			permission: 2,
			disallowPM: true,
			action(message) {
				message = toId(message);

				if (!message.length) return this.pmreply("Please enter a valid quote.");
				if (!quotedata[this.room]) return this.pmreply("This room has no quotes.");

				for (let i = 0; i < quotedata[this.room].length; i++) {
					if (toId(quotedata[this.room][i]) === message) {
						this.reply("Removed quote: " + quotedata[this.room].splice(i, 1)[0]);
						return databases.writeDatabase('quotes');
					}
				}

				return this.reply("Quote not found.");
			},
		},

		quotes: {
			permission: 1,
			action(message) {
				let pm = false;
				if (!this.room) {
					if (message) {
						let room = toId(message);
						if (!this.getRoomAuth(room)) return;
						this.room = room;
						pm = true;
					} else {
						return this.pmreply("No room supplied.");
					}
				}
				if (quotedata[this.room]) {
					let fname = this.room + "/quotes";
					let permission = (pm && this.canUse(5));
					if (Config.privateRooms.has(this.room) || permission) {
						let data = {};
						data.room = this.room;
						data.permission = (permission ? 'quotes' : false);
						let token = server.createAccessToken(data, 15);
						fname += '?token=' + token;
					}
					if (pm) {
						return this.pmreply("Quote page: " + server.url + fname);
					}
					return this.reply("Quote page: " + server.url + fname);
				}

				if (pm) {
					return this.pmreply("This room has no quotes.");
				}
				return this.reply("This room has no quotes.");
			},
		},

		randquote: {
			permission: 1,
			disallowPM: true,
			action() {
				if (quotedata[this.room] && quotedata[this.room].length) {
					let randquote = quotedata[this.room][Math.floor(Math.random() * quotedata[this.room].length)];
					if (randquote[0] === '/' || randquote[0] === '!') randquote = randquote.substr(1);
					return this.reply(randquote);
				}

				return this.pmreply("This room has no quotes.");
			},
		},
	},
};
