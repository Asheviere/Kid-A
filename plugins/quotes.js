'use strict';

const fs = require('fs');

const server = require('../server.js');
const redis = require('../redis.js');

const quotedata = redis.useDatabase('quotes');

server.addTemplate('quotes', 'quotes.html');

async function editQuotes(data, room) {
	let {delete: toDelete, edits: toEdit} = data;

	let quotes = await redis.getList(quotedata, room);

	for (let i = 0; i < quotes.length; i++) {
		if (toDelete && toDelete.includes(i.toString())) {
			quotedata.lrem(room, 0, quotes[i]);
		}

		if (toEdit && i in toEdit) {
			quotedata.lset(room, i, toEdit[i]);
		}
	}
}

async function quoteResolver(req, res) {
	let room = req.originalUrl.split('/')[1];
	let query = server.parseURL(req.url);
	let token = query.token;
	let quotes = await redis.getList(quotedata, room);
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
				await editQuotes(data, room);
			}
			return res.end(server.renderTemplate('quotes', {room: room, data: quotes, permission: true}));
		}
	}
	res.end(server.renderTemplate('quotes', {room: room, data: quotes}));
}

async function init() {
	let rooms = await quotedata.keys('*');
	for (let i = 0; i < rooms.length; i++) {
		await server.addRoute(`/${rooms[i]}/quotes`, quoteResolver)
	}
	server.restart();
}

init();

module.exports = {
	commands: {
		quote: {
			permission: 2,
			disallowPM: true,
			async action(message) {
				if (!message.length) return this.pmreply("Please enter a valid quote.");

				if (!(await quotedata.exists(this.room))) {
					if (!Config.privateRooms.has(this.room)) {
						server.addRoute('/' + this.room + '/quotes', quoteResolver);
						// Wait 500ms to make sure everything's ready.
						setTimeout(() => server.restart(), 500);
					}
				}

				let quotes = await redis.getList(quotedata, this.room);

				if (quotes.includes(message)) {
					return this.reply("Quote is already added.");
				}

				await quotedata.lpush(this.room, message);
				return this.reply("Quote has been added.");
			},
		},

		deletequote: {
			permission: 2,
			disallowPM: true,
			async action(message) {
				message = toId(message);

				if (!message.length) return this.pmreply("Please enter a valid quote.");
				if (!(await quotedata.exists(this.room))) return this.pmreply("This room has no quotes.");

				if (await quotedata.lrem(this.room, 0, message)) {
					this.reply("Quote deleted");
				} else {
					this.reply("Quote not found.");
				}
			},
		},

		quotes: {
			permission: 1,
			async action(message) {
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
				if (await quotedata.exists(this.room)) {
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
			async action() {
				if (await quotedata.exists(this.room)) {
					let quotes = await redis.getList(quotedata, this.room);
					let randquote = quotes[Math.floor(Math.random() * quotes.length)];
					if (randquote[0] === '/' || randquote[0] === '!') randquote = randquote.substr(1);
					return this.reply(randquote);
				}

				return this.pmreply("This room has no quotes.");
			},
		},
	},
};
