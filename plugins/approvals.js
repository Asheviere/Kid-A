const probe = require('probe-image-size');
const validUrl = require('valid-url');
const request = require('request');

const redis = require('../redis.js');

const COSMO = 'cosmopolitan';
const YOUTUBE_ROOM = 'youtube';
const YT_ROOT = 'https://www.googleapis.com/youtube/v3/videos';
const VIDEO_ROOT = 'https://youtu.be/';
const CHANNEL_ROOT = 'https://www.youtube.com/channel/';

const settings = redis.useDatabase('settings');

async function fitImage(url, maxHeight = 300, maxWidth = 400) {
	let {height, width} = await probe(url);

	let ratio = 1;

	if (width <= maxWidth && height <= maxHeight) return [width, height];

	if (height * (maxWidth/maxHeight) > width) {
		ratio = maxHeight / height;
	} else {
		ratio = maxWidth / width;
	}

	return [width * ratio, height * ratio];
}

async function getYoutubeVideoInfo(id) {
	let yturl = `${YT_ROOT}?part=snippet%2Cstatistics&id=${encodeURIComponent(id)}&key=${Config.youtubeKey}`;

	let yt = new Promise(function(resolve, reject) {
		request(yturl, function(error, response, body) {
			if (error) {
				errorMsg(error);
				reject(error);
			} else {
				resolve(JSON.parse(body));
			}
		});
	});

	let video = await yt;

	if (video.error) {
		errorMsg(video.error.message);
		return false;
	} else if (video.items && video.items.length && video.items[0].id) {
		video = video.items[0];
		return {id: video.id, title: video.snippet.title, date: new Date(video.snippet.publishedAt), description: video.snippet.description, channel: video.snippet.channelTitle, channelUrl: video.snippet.channelId, views: video.statistics.viewCount, thumbnail: video.snippet.thumbnails.standard.url, likes: video.statistics.likeCount, dislikes: video.statistics.dislikeCount};
	}
}

const pendingApprovals = new Map();
const ROOMS = [COSMO, YOUTUBE_ROOM];

async function draw(user, data, self) {
	switch (this.room) {
	case YOUTUBE_ROOM:
		return this.reply(`/addhtmlbox <table><tbody><tr><td style="padding-right: 5px"><img src="${data.thumbnail}" width="120" height="90"></td><td><b><a href=${VIDEO_ROOT}${data.id}>${data.title}</a></b><br/>Uploaded ${data.date.toDateString()} by <b><a href="${CHANNEL_ROOT}${data.channelUrl}">${data.channel}</a></b><br/><b>${data.views}</b> views, <b><span style="color:green">${data.likes}</span> | <span style="color:red">${data.dislikes}</span></b><br/><details><summary>[Description]</summary><i>${data.description.replace(/\n/g, '<br/>')}</i></details></td></tr></tbody></table>`);
	default:
		let [width, height] = await fitImage(data).catch(() => this.reply("Something went wrong getting dimensions of the image."));

		if (!(width && height)) return;
		return this.reply(`/addhtmlbox <a href="${data}"><img src="${data}" width="${Math.round(width)}" height="${Math.round(height)}"/></a>${self ? "" : `<br/><small>(Image suggested by ${user} and approved by ${this.username})</small>`}`);
	}
}

async function parse(room, url) {
	let data;
	switch (room) {
	case YOUTUBE_ROOM:
		let id = '';
		let idx = url.indexOf('youtu.be/');
		if (idx > -1) {
			id = url.substr(idx + 9);
		} else {
			let idx = url.indexOf('?v=');
			if (idx < 0) {
				this.reply("Invalid url.");
				return false;
			}
			id = url.substr(idx + 3);
		}
		id = id.split('&')[0];

		let videoInfo = await getYoutubeVideoInfo(id);
		if (!videoInfo) {
			this.reply("Invalid youtube video.");
			return false;
		}

		data = {user: this.username, data: videoInfo};
		break;
	default:
		if (!/^https?:\/\//.test(url)) url = `http://${url}`;
		if (!validUrl.isWebUri(url)) {
			this.reply("That's not a valid URL.");
			return false;
		}

		data = {user: this.username, data: url};
	}

	return data;
}

module.exports = {
	commands: {
		requestapproval: {
			rooms: ROOMS,
			async action(message) {
				let room = this.room;
				let url;
				if (!room) {
					let split = message.split(',');
					[room, url] = split.map(param => param.trim());
					if (!(room && url)) return this.pmreply("Syntax: ``.requestapproval room, url``");
					if (!ROOMS.includes(room)) return this.pmreply("This room does not support this feature.");
					if (!this.getRoomAuth(room)) return;
				} else {
					url = message;
					if (!url) return this.pmreply("Syntax: ``.requestapproval url``");
				}

				if (pendingApprovals.has(room)) return this.reply("There is already someone awaiting approval.");

				let data = await parse.call(this, room, url);
				if (!data) return;

				pendingApprovals.set(room, data);

				Connection.send(`${room}|${this.username} wishes to have a link approved!`);
				Connection.send(`${room}|/modnote ${this.username} wishes to get approval to post '${url}' in the room. Type .approve or .reject to handle the request.`);
			},
		},
		approve: {
			hidden: true,
			disallowPM: true,
			rooms: ROOMS,
			permission: 2,
			async action() {
				if (!pendingApprovals.has(this.room)) return this.pmreply("There is nothing to approve.");

				let {user, data} = pendingApprovals.get(this.room);
				pendingApprovals.delete(this.room);
				await draw.call(this, user, data);
			},
		},
		link: {
			hidden: true,
			disallowPM: true,
			rooms: ROOMS,
			async action(message) {
				if (this.room === COSMO && !this.canUse(2)) return this.pmreply("Permission denied.");
				if (this.room === YOUTUBE_ROOM && !(this.canUse(1) || (await settings.hexists(`whitelist:${YOUTUBE_ROOM}`, this.userid)))) return this.pmreply("Permission denied.");
				let {user, data} = await parse.call(this, this.room, message);
				if (!user) return;
				draw.call(this, this.username, data, true);
			},
		},
		reject: {
			hidden: true,
			disallowPM: true,
			rooms: ROOMS,
			permission: 2,
			async action() {
				if (!pendingApprovals.has(this.room)) return this.pmreply("There is nothing to reject.");

				let {user} = pendingApprovals.get(this.room);
				pendingApprovals.delete(this.room);

				Connection.send(`|/pm ${user}, Your link was rejected.`);
				return this.reply(`/modnote ${this.username} rejected ${user}'s link.`);
			},
		},
		whitelist: {
			rooms: ROOMS,
			async action(message) {
				let room = this.room;
				let user;
				if (!room) {
					let split = message.split(',');
					[room, user] = split.map(param => param.trim());
					if (!(room && user)) return this.pmreply("Syntax: ``.whitelist room, username``");
					if (!ROOMS.includes(room)) return this.pmreply("This room does not support this feature.");
					if (!this.getRoomAuth(room)) return;
				} else {
					user = message;
					if (!user) return this.pmreply("Syntax: ``.whitelist username``");
				}
				if (!this.canUse(2)) return this.pmreply("Permission denied.");

				if (await settings.hexists(`whitelist:${room}`, toId(user))) return this.reply("This user is already whitelisted.");

				await settings.hset(`whitelist:${room}`, toId(user), user);
				Connection.send(`${room}|/modnote ${toId(user)} was whitelisted for links by ${this.username}.`);
				return this.reply("User successfully whitelisted.");
			},
		},
		unwhitelist: {
			rooms: ROOMS,
			async action(message) {
				let room = this.room;
				let user;
				if (!room) {
					let split = message.split(',');
					[room, user] = split.map(param => param.trim());
					if (!(room && user)) return this.pmreply("Syntax: ``.whitelist room, username``");
					if (!ROOMS.includes(room)) return this.pmreply("This room does not support this feature.");
					if (!this.getRoomAuth(room)) return;
				} else {
					user = message;
					if (!user) return this.pmreply("Syntax: ``.whitelist username``");
				}
				if (!this.canUse(2)) return this.pmreply("Permission denied.");

				if (await settings.hexists(`whitelist:${room}`, toId(user))) return this.reply("This user isn't whitelisted.");

				await settings.hdel(`whitelist:${room}`, toId(user));
				Connection.send(`${room}|/modnote ${toId(user)} was unwhitelisted for links list by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
	},
};
