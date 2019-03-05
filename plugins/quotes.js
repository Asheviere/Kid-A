'use strict';

const server = require('../server.js');
const Page = require('../page.js');
const redis = require('../redis.js');

const quotedata = redis.useDatabase('quotes');

const quotePage = new Page('quotes', quoteGenerator, 'quotes.html', {token: 'quotes', postHandler: editQuotes, optionalToken: true});

async function editQuotes(data, room) {
	let {delete: toDelete, edits: toEdit} = data;

	let quotes = await quotedata.lrange(room, 0, -1);

	for (let i = 0; i < quotes.length; i++) {
		if (toDelete && toDelete.includes(i.toString())) {
			await quotedata.lrem(room, 0, quotes[i]);
		}

		if (toEdit && i in toEdit) {
			await quotedata.lset(room, i, toEdit[i]);
		}
	}
}

async function quoteGenerator(room, query, tokenData) {
	let quotes = await quotedata.lrange(room, 0, -1);
	if (!tokenData && ChatHandler.privateRooms.has(room)) return 'Private Room quotes require an access token to be viewed.';

	return {room: room, data: quotes, permission: tokenData.quotes};
}

module.exports = {
	async init() {
		let rooms = await quotedata.keys('*');
		for (let i = 0; i < rooms.length; i++) {
			quotePage.addRoom(rooms[i]);
		}
	},
	commands: {
		quote: {
			permission: 2,
			disallowPM: true,
			async action(message) {
				if (!message.length) return this.pmreply("Please enter a valid quote.");

				if (!(await quotedata.exists(this.room))) {
					quotePage.addRoom(this.room);
					setTimeout(() => server.restart(), 500);
				}

				let quotes = await quotedata.lrange(this.room, 0, -1);

				if (quotes.includes(message)) {
					return this.reply("Quote is already added.");
				}

				await quotedata.rpush(this.room, message);
				return this.reply("Quote has been added.");
			},
		},

		deletequote: {
			permission: 2,
			disallowPM: true,
			async action(message) {
				if (!message.length) return this.pmreply("Please enter a valid quote.");
				if (!(await quotedata.exists(this.room))) return this.pmreply("This room has no quotes.");

				if (await quotedata.lrem(this.room, 0, message.trim())) {
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
						if (!(room in this.userlists)) return this.pmreply("Room not found.");
						if (!this.getRoomAuth(room)) return;
						this.room = room;
						pm = true;
					} else {
						return this.pmreply("No room supplied.");
					}
				}
				if (await quotedata.exists(this.room)) {
					const permission = (pm && this.canUse(5));
					const url = quotePage.getUrl(this.room, this.userid, permission, {}, !(ChatHandler.privateRooms.has(this.room) || permission));
					if (pm) {
						return this.pmreply(`Quote page for ${this.room}: ${url}`);
					}
					return this.reply(`Quote page for ${this.room}: ${url}`);
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
					let quotes = await quotedata.lrange(this.room, 0, -1);
					let randquote = quotes[Math.floor(Math.random() * quotes.length)];
					if (!randquote.startsWith('!showimage ')) randquote = randquote.replace(/^[/!]+/, '');
					return this.reply(randquote);
				}

				return this.pmreply("This room has no quotes.");
			},
		},
	},
};
