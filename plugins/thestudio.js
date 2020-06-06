'use strict';

const Page = require('../page.js');
const redis = require('../redis.js');
const ytApi = require('../utils/youtube-api.js');

const THE_STUDIO = 'thestudio';
const AVATAR_URL = `https://play.pokemonshowdown.com/sprites/trainers/`;
const CUSTOM_AVATAR_URL = `https://play.pokemonshowdown.com/sprites/trainers-custom/`;

let db = redis.useDatabase('thestudio');

async function recsGenerator() {
	let keys = ['Song', 'Tags', 'Description', 'Recommended by', 'Score'];
	let data = [];

	let recs = await db.keys('*');

	for (let i = 0; i < recs.length; i++) {
		let entry = await db.hgetall(recs[i]);

		data.push([`<a href="${entry.link}">${entry.artist} - ${entry.title}</a>`, entry.tags.split('|').join(', '), entry.description || '', entry.user, entry.score || 0]);
	}

	return {room: THE_STUDIO, columnNames: keys, entries: data};
}

new Page('recs', recsGenerator, 'songrecs.html', {rooms: [THE_STUDIO]});

// Looks like overkill but saves me a ton of time if I want to port over the whole auto collapse idea to other rooms.
class SongRecs {
	constructor(room) {
		this.room = room;
		this.pending = [];

		setInterval(() => {
			if (this.pending.length) this.render(this.pending[0].rec, true);
		}, 1000 * 60 * 60);

		setInterval(async () => {
			const rec = await db.hgetall((await db.randomkey()));
			this.queueRec(rec);
		}, 1000 * 60 * 60 * 6);
	}

	async queueRec(rec) {
		rec.id = Utils.randomBytes(5);
		rec.key = `${toId(rec.artist)}|${toId(rec.title)}`;

		await this.render(rec);

		await this.collapseRec(this.lastRec);
		this.lastRec = rec;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => this.lastRec = null, 1000 * 60 * 60);
	}

	request(rec) {
		return new Promise((resolve, reject) => {
			rec.id = Utils.randomBytes(5);
			this.pending.push({rec, resolve, reject, user: rec.user});
			if (this.pending.length === 1) this.render(rec, true);
		}).finally(async () => {
			await this.collapseRec(this.pending[0].rec);
			this.pending.shift();
			if (this.pending.length) this.render(this.pending[0].rec, true);
		});
	}

	async approve() {
		if (!this.pending.length) return;
		ChatHandler.sendPM(this.pending.user, "Your song recommendation was approved.");
		this.pending[0].resolve(true);
	}

	async reject() {
		if (!this.pending.length) return;
		const name = this.pending[0].user;
		ChatHandler.sendPM(name, "Your song recommendation was rejected.");
		this.pending[0].reject(false);
		return name;
	}

	async render(rec = this.lastRec, forApproval = false, pm = false) {
		let videoInfo;
		let dbInfo;

		const videoId = await ytApi.getVideoIdFromURL(rec.link || '');
		if (videoId) {
			videoInfo = await ytApi.getYoutubeVideoInfo(videoId);
		}

		if (!forApproval) {
			dbInfo = await db.hgetall(rec.key);
		}

		let content = `<div style="color:black;background: linear-gradient(rgba(210 , 210 , 210) , rgba(225 , 225 , 225))"> <table style="margin: auto ; background: rgba(255 , 255 , 255 , 0.25) ; padding: 3px"> <tbody><tr>${videoInfo ? `<td style="text-align: center"> <img src="${videoInfo.thumbnail}" width="120" height="67"><br> <small><i>${!forApproval ? `${dbInfo.score || 0} point${dbInfo.score !== '1' ? 's' : ''} | ` : ''}${videoInfo.views} views</i></small> </td>` : ''} <td style="max-width: 300px"> <a href="${rec.link}" style="color: black ; font-weight: bold" target="_blank" rel="noopener">${rec.artist} - ${rec.title}<br></a> ${rec.tags ? `<b>Tags:</b> <i>${Utils.sanitize(rec.tags.split('|').join(', '))}</i><br>` : ''} ${rec.description ? `<span style="display: inline-block ; line-height: 1.15em"><b>Description:</b> ${Utils.sanitize(rec.description)}</span><br>` : ''} ${!videoInfo && !forApproval ? `<b>Score:</b> ${dbInfo.score || 0} point${dbInfo.score !== 1 ? 's' : ''}<br>` : ''} ${!dbInfo || !dbInfo.avatar ? `<b>Recommended by: ${rec.user}</b><br>` : ''} ${forApproval ? `<button name="send" value="/pm ${Config.username}, .approverec ${this.room}" class="button" style="float: right ; display: inline ; padding: 3px 5px ; font-size: 8pt">Approve</button><button name="send" value="/pm ${Config.username}, .rejectrec ${this.room}" class="button" style="float: right ; display: inline ; padding: 3px 5px ; font-size: 8pt">Reject</button>` : `<button name="send" value="/pm ${Config.username}, .likerec ${this.room}" class="button" style="float: right ; display: inline ; padding: 3px 5px ; font-size: 8pt"><img src="http://play.pokemonshowdown.com/sprites/bwicons/441.png" style="margin: -9px -30px -6px -7px ; margin-right: 0px" width="32" height="32"><span style="position: relative ; bottom: 2.6px">Upvote</span></button>`} </td> ${!forApproval && dbInfo.avatar ? `<td style="text-align: center ; width: 110px ; background: rgba(255 , 255 , 255 , 0.4) ; border-radius: 15px"><img style="margin-bottom: -38px" src="${dbInfo.avatar.startsWith('#') ? `${CUSTOM_AVATAR_URL}${dbInfo.avatar.slice(1)}.png` : `${AVATAR_URL}${dbInfo.avatar}.png`}" width="80" height="80"><br> <span style="background: rgba(0 , 0 , 0 , 0.5) ; padding: 1.5px 4px ; color: white ; font-size: 7pt">Recommended by:</span><br><b style="background: rgba(0 , 0 , 0 , 0.5) ; padding: 1.5px 4px ; color: white ; font-size: 7pt">${rec.user}</b> </td>` : ''} </tr> </tbody></table> </div>`;

		let command;
		if (forApproval) {
			command = `addrankuhtml %, ${rec.id}`;
		} else if (pm) {
			command = 'pminfobox';
		} else {
			command = `${rec === this.lastRec ? 'change' : 'add'}uhtml ${rec.id}`;
		}

		ChatHandler.send(this.room, `/${command}, ${content}`);
	}

	async collapseRec(rec, forApproval = false) {
		if (!rec) return;

		let content = `<div style="color:black;background: linear-gradient(rgba(210 , 210 , 210) , rgba(225 , 225 , 225))"> <table style="margin: auto ; background: rgba(255 , 255 , 255 , 0.25) ; padding: 3px"> <tbody><tr> <td style="text-align: center"> <a href="${rec.link}" style="color: black ; font-weight: bold" target="_blank" rel="noopener">${rec.artist} - ${rec.title}<br></a> ${rec.tags ? `<b>Tags:</b> <i>${Utils.sanitize(rec.tags.split('|').join(', '))}</i><br>` : ''} <b>Recommended by: ${rec.user}</b><br> </td> </tr> </tbody></table> </div>`;

		ChatHandler.send(this.room, `/change${forApproval ? 'rank' : ''}uhtml ${forApproval ? '%, ' : ''}${rec.id}, ${content}`);
	}

	async likeRec(username) {
		if (!this.lastRec) return false;
		let ids = ((await db.hget(this.lastRec.key, 'voters')) || '').split('|');
		if (ids.includes(toId(username))) return false;
		ids.push(toId(username));
		await db.hset(this.lastRec.key, 'voters', ids.join('|'));
		await db.hincrby(this.lastRec.key, 'score', 1);
		this.render();
		return true;
	}
}

const songRecs = new SongRecs(THE_STUDIO);

module.exports = {
	commands: {
		approverec: {
			hidden: true,
			requireRoom: true,
			permission: 2,
			async action() {
				songRecs.approve();
			},
		},
		rejectrec: {
			hidden: true,
			requireRoom: true,
			permission: 2,
			async action() {
				const username = await songRecs.reject();
				if (username) {
					return ChatHandler.send(this.room, `/modnote ${this.username} rejected ${username}'s song rec.`);
				}
			},
		},
		addrec: {
			rooms: [THE_STUDIO],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(THE_STUDIO)) return;
				}

				if (!message) return this.reply('Syntax: ``.addrec artist | title | link | description | tags``');

				let [artist, title, link, description, ...tags] = message.split(message.includes('|') ? '|' : ',').map(param => param.trim());

				if (!toId(artist) || !toId(title) || !toId(link)) return this.reply('Syntax: ``.addrec artist | title | link | description | tags``');

				let key = `${toId(artist)}|${toId(title)}`;

				if (await db.exists(key)) return this.reply('This song is already recommended.');

				let tagStr = tags.map(tag => tag.trim()).join('|');
				// Idiot protection
				tagStr = tagStr.split(',').join('|');

				if (this.auth === ' ') {
					let req = songRecs.request({artist, title, link, description, user: this.username});
					if (!req) return this.reply("There is already someone waiting for approval.");
					this.pmreply("Awaiting approval for your song rec.");
					req = await req.catch(() => {});
					if (!req) return;
				}

				await db.hmset(key, 'artist', artist, 'title', title, 'link', link, 'user', this.username, 'description', description, 'tags', tagStr);

				ChatHandler.query('userdetails', this.userid).then(details => {
					db.hset(key, 'avatar', Utils.toAvatarId(details.avatar));
				});

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

				let key = `${toId(artist)}|${toId(title)}`;

				if (!(await db.exists(key))) return this.reply('This song isn\'t recommended.');

				let entry = await db.hgetall(key);

				if (toId(entry.user) !== this.userid && !this.canUse(2)) return this.reply("Only staff may delete other people's recommendations.");

				await db.del(key);

				ChatHandler.send(THE_STUDIO, `/modnote ${this.username} removed the song rec for '${artist} - ${title}'`);
				return this.reply("Song recommendation deleted.");
			},
		},
		likerec: {
			hidden: true,
			async action() {
				if (await songRecs.likeRec(this.username)) {
					this.pmreply('You like this song rec.');
				} else {
					this.pmreply('You have already liked this song rec.');
				}
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

				if (this.pm) {
					rec.key = `${toId(rec.artist)}|${toId(rec.title)}`;
					songRecs.render(rec, false, true);
				} else {
					songRecs.queueRec(rec);
				}
			},
		},
	},
};
