'use strict';

const redis = require('../redis.js');

const THE_STUDIO = 'thestudio';

let db = redis.useDatabase('thestudio');

// artist|title: {artist: shit, title: shit, user: shit, url: shit, tags: tag1|tag2|tag3}

module.exports = {
	commands: {
		addrec: {
			rooms: [THE_STUDIO],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(THE_STUDIO)) return;
				}

				if (!(this.canUse(1))) return this.pmreply("Permission denied.");

				if (!message) return this.reply('Syntax: ``.addrec artist | title | link | tags``');

				let [artist, title, link, ...tags] = message.split(message.includes('|') ? '|' : ',').map(param => param.trim());

				if (!toId(artist) || !toId(title) || !toId(link)) return this.reply('Syntax: ``.addrec artist | title | link | tags``');

				let key = `${toId(artist)}|${toId(title)}}`;

				if (await db.exists(key)) return this.reply('This song is already recommended.');

				let tagStr = tags.map(tag => toId(tag)).join('|');

				await db.hmset(key, 'artist', artist, 'title', title, 'link', link, 'user', this.username, 'tags', tagStr);

				return this.reply("Song recommendation added.");
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

						let tags = entry.tags.split('|');

						if (tags.includes(message)) possibilities.push(entry);
					}

					if (!possibilities.length) return this.reply(`No song found with the tag '${message}'`);

					rec = possibilities[Math.floor(Math.random() * possibilities.length)];
				} else {
					rec = await db.hgetall((await db.randomkey()));
				}

				let tagStr = '';

				if (rec.tags.length) {
					tagStr = ` Tag${rec.tag.length > 1 ? 's' : ''}: ${rec.tags.split('|').join(', ')})`;
				}

				return this.reply(`${rec.artist} - ${rec.title}: ${rec.link} (recommended by ${rec.user}.${tagStr}`);
			},
		},
	},
};