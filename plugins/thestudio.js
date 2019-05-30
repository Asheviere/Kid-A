'use strict';

const Page = require('../page.js');
const redis = require('../redis.js');

const THE_STUDIO = 'thestudio';

let db = redis.useDatabase('thestudio');

async function recsGenerator() {
	let keys = ['Song', 'Tags', 'Recommended by'];
	let data = [];

	let recs = await db.keys('*');

	for (let i = 0; i < recs.length; i++) {
		let entry = await db.hgetall(recs[i]);

		data.push([`<a href="${entry.link}">${entry.artist} - ${entry.title}</a>`, entry.tags.split('|').join(', '), entry.user]);
	}

	return {room: THE_STUDIO, columnNames: keys, entries: data};
}

new Page('recs', recsGenerator, 'songrecs.html', {rooms: [THE_STUDIO]});

module.exports = {
	commands: {
		addrec: {
			rooms: [THE_STUDIO],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(THE_STUDIO)) return;
					if (this.auth === ' ') return this.pmreply("Permission denied.");
				}

				if (!(this.canUse(1))) return this.pmreply("Permission denied.");

				if (!message) return this.reply('Syntax: ``.addrec artist | title | link | tags``');

				let [artist, title, link, ...tags] = message.split(message.includes('|') ? '|' : ',').map(param => param.trim());

				if (!toId(artist) || !toId(title) || !toId(link)) return this.reply('Syntax: ``.addrec artist | title | link | tags``');

				let key = `${toId(artist)}|${toId(title)}}`;

				if (await db.exists(key)) return this.reply('This song is already recommended.');

				let tagStr = tags.map(tag => tag.trim()).join('|');

				await db.hmset(key, 'artist', artist, 'title', title, 'link', link, 'user', this.username, 'tags', tagStr);

				ChatHandler.send(THE_STUDIO, `/modnote ${this.username} added a song rec for '${artist} - ${title}'`);
				return this.reply("Song recommendation added.");
			},
		},
		deleterec: {
			rooms: [THE_STUDIO],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(THE_STUDIO)) return;
				}

				if (!(this.canUse(1))) return this.pmreply("Permission denied.");

				if (!message) return this.reply('Syntax: ``.deleterec artist, title``');

				let [artist, title] = message.split(',').map(param => param.trim());

				if (!toId(artist) || !toId(title)) return this.reply('Syntax: ``.deleterec artist, title``');

				let key = `${toId(artist)}|${toId(title)}}`;

				if (!(await db.exists(key))) return this.reply('This song isn\'t recommended.');

				let entry = await db.hgetall(key);

				if (toId(entry.user) !== this.userid && !this.canUse(2)) return this.reply("Only staff may delete other people's recommendations.");

				await db.del(key);

				ChatHandler.send(THE_STUDIO, `/modnote ${this.username} removed the song rec for '${artist} - ${title}'`);
				return this.reply("Song recommendation deleted.");
			},
		},
		rec: {
			rooms: [THE_STUDIO],
			permission: 1,
			async action(message) {
				let rec;

				if (message) {
					message = toId(message);

					let possibilities = [];

					let keys = await db.keys('*');

					for (let i = 0; i < keys.length; i++) {
						let entry = await db.hgetall(keys[i]);

						let tags = entry.tags.split('|').map(tag => toId(tag));

						if (tags.includes(message) || toId(entry.user) === message) possibilities.push(entry);
					}

					if (!possibilities.length) return this.reply(`No song found with the tag '${message}'`);

					rec = possibilities[Math.floor(Math.random() * possibilities.length)];
				} else {
					rec = await db.hgetall((await db.randomkey()));
				}

				let tagStr = '';

				if (rec.tags.length) {
					tagStr = ` Tag${rec.tags.length > 1 ? 's' : ''}: ${rec.tags.split('|').join(', ')}`;
				}

				return this.reply(`${rec.artist} - ${rec.title}: ${rec.link} (recommended by __${rec.user}__.${tagStr})`);
			},
		},
	},
};
