const probe = require('probe-image-size');
const validUrl = require('valid-url');
const request = require('request');

const redis = require('../redis.js');
const Cache = require('../cache.js');

// Taken from the PS client
const domainRegex = '[a-z0-9\\-]+(?:[.][a-z0-9\\-]+)*';
const parenthesisRegex = '[(](?:[^\\s()<>&]|&amp;)*[)]';
const linkRegex = new RegExp(
	'\\b' +
	'(?:' +
		'(' +
			// When using www. or http://, allow any-length TLD (like .museum)
			'(?:https?://|www[.])' + domainRegex +
			'|' + domainRegex + '[.]' +
				// Allow a common TLD, or any 2-3 letter TLD followed by : or /
				'(?:com?|org|net|edu|info|us|jp|[a-z]{2,3}(?=[:/]))' +
		')' +
		'(?:[:][0-9]+)?' +
		'\\b' +
		'(?:' +
			'/' +
			'(?:' +
				'(?:' +
					'[^\\s()&]|&amp;|&quot;' +
					'|' + parenthesisRegex +
				')*' +
				// URLs usually don't end with punctuation, so don't allow
				// punctuation symbols that probably aren't related to URL.
				'(?:' +
					'[^\\s`()\\[\\]{}\'".,!?;:&]' +
					'|' + parenthesisRegex +
				')' +
			')?' +
		')?' +
		'|[a-z0-9.]+\\b@' + domainRegex + '[.][a-z]{2,3}' +
	')',
	'ig'
);

const YOUTUBE_ROOM = 'youtube';
const YT_ROOT = 'https://www.googleapis.com/youtube/v3/videos';
const VIDEO_ROOT = 'https://youtu.be/';
const CHANNEL_ROOT = 'https://www.youtube.com/channel/';
const HOUR = 60 * 60 * 1000;

const settings = redis.useDatabase('settings');
const dailyCache = new Cache('daily');

// Thanks Zarel for this obviously extremely well-coded function from PS.
function escapeHTML(str) {
	if (!str) return '';
	return ('' + str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\//g, '&#x2f;');
}

async function fitImage(url, maxHeight = 300, maxWidth = 400) {
	let {height, width} = await probe(url);

	let ratio = 1;

	if (width <= maxWidth && height <= maxHeight) return [width, height];

	if (height * (maxWidth/maxHeight) > width) {
		ratio = maxHeight / height;
	} else {
		ratio = maxWidth / width;
	}

	return [Math.round(width * ratio), Math.round(height * ratio)];
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
		return {id: video.id, title: video.snippet.title, date: new Date(video.snippet.publishedAt), description: video.snippet.description, channel: video.snippet.channelTitle, channelUrl: video.snippet.channelId, views: video.statistics.viewCount, thumbnail: video.snippet.thumbnails.default.url, likes: video.statistics.likeCount, dislikes: video.statistics.dislikeCount};
	}
}

const pendingApprovals = new Map();

const selfLinkTimeouts = new Map();

async function draw(user, data, desc, self) {
	switch (this.room) {
	case YOUTUBE_ROOM:
		return this.reply(`/addhtmlbox <table><tbody><tr><td style="padding-right: 5px"><img src="${data.thumbnail}" width="120" height="90"></td><td><b><a href=${VIDEO_ROOT}${data.id}>${data.title}</a></b><br/>Uploaded ${data.date.toDateString()} by <b><a href="${CHANNEL_ROOT}${data.channelUrl}">${data.channel}</a></b><br/><b>${data.views}</b> views, <b><span style="color:green">${data.likes}</span> | <span style="color:red">${data.dislikes}</span></b><br/>${desc ? `<i>${escapeHTML(desc)}</i><br/>` : ''}<details><summary>[Video Description]</summary><i>${escapeHTML(data.description).replace(/\n/g, '<br/>')}</i></details></td></tr></tbody></table>`);
	default:
		return this.reply(`/addhtmlbox <a href="${data.url}"><img src="${data.url}" width="${data.width}" height="${data.height}"/></a>${desc ? `<br/><i>${escapeHTML(desc)}</i>` : ""}${self ? "" : `<br/><small>(Image suggested by ${user} and approved by ${this.username})</small>`}`);
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

		let dimensions = await fitImage(url).catch(() => this.reply("Something went wrong getting the dimensions of the image."));
		if (!dimensions) return false;
		let [width, height] = dimensions;

		data = {user: this.username, data: {url: url, width: width, height: height}};
	}

	return data;
}

module.exports = {
	options: ['imagethumbnails'],
	commands: {
		requestapproval: {
			async action(message) {
				let room = this.room;
				let url, description;
				if (!room) {
					[room, url, ...description] = message.split(',').map(param => param.trim());
					if (!(room && url)) return this.pmreply("Syntax: ``.requestapproval room, url, (optional) description``");
					if (!this.getRoomAuth(room)) return;
				} else {
					[url, ...description] = message.split(',').map(param => param.trim());
					if (!url) return this.pmreply("Syntax: ``.requestapproval url, (optional) description``");
				}

				if (pendingApprovals.has(room)) return this.reply("There is already someone awaiting approval.");

				if (description) {
					description = description.join(', ');
					if (description.length > 200) return this.reply("The description is too long.");
				}

				let data = await parse.call(this, room, url);
				if (!data) return;
				if (description) data.description = description;

				pendingApprovals.set(room, data);

				Connection.send(`${room}|${this.username} wishes to have a link approved!`);
				Connection.send(`${room}|/modnote ${this.username} wishes to get approval to post '${url}' in the room${description ? ` (${description})` : ''}. Type .approve or .reject to handle the request.`);
			},
		},
		approve: {
			hidden: true,
			disallowPM: true,
			permission: 2,
			async action() {
				if (!pendingApprovals.has(this.room)) return this.pmreply("There is nothing to approve.");

				let {user, data, description} = pendingApprovals.get(this.room);
				pendingApprovals.delete(this.room);
				await draw.call(this, user, data, description);
			},
		},
		link: {
			hidden: true,
			disallowPM: true,
			async action(message) {
				if (!(this.canUse(this.room === YOUTUBE_ROOM ? 1 : 2))) {
					if (!(await settings.hexists(`whitelist:${this.room}`, this.userid))) return this.pmreply("Permission denied.");
					if (this.room === YOUTUBE_ROOM) {
						if (selfLinkTimeouts.has(this.userid)) return this.reply("You are only allowed to post your own link once per two hours.");
						selfLinkTimeouts.set(this.userid, setTimeout(() => selfLinkTimeouts.delete(this.userid), 2 * HOUR));
					}
				}
				let [url, ...description] = message.split(',').map(param => param.trim());
				if (description) {
					description = description.join(', ');
					if (description.length > 200) return this.reply("The description is too long.");
				}
				let {user, data} = await parse.call(this, this.room, url);
				if (!user) return;
				draw.call(this, this.username, data, description, true);
			},
		},
		reject: {
			hidden: true,
			disallowPM: true,
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
			async action(message) {
				let room = this.room;
				let user;
				if (!room) {
					let split = message.split(',');
					[room, user] = split.map(param => param.trim());
					if (!(room && user)) return this.pmreply("Syntax: ``.whitelist room, username``");
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
			async action(message) {
				let room = this.room;
				let user;
				if (!room) {
					let split = message.split(',');
					[room, user] = split.map(param => param.trim());
					if (!(room && user)) return this.pmreply("Syntax: ``.whitelist room, username``");
					if (!this.getRoomAuth(room)) return;
				} else {
					user = message;
					if (!user) return this.pmreply("Syntax: ``.whitelist username``");
				}
				if (!this.canUse(2)) return this.pmreply("Permission denied.");

				if (!(await settings.hexists(`whitelist:${room}`, toId(user)))) return this.reply("This user isn't whitelisted.");

				await settings.hdel(`whitelist:${room}`, toId(user));
				Connection.send(`${room}|/modnote ${toId(user)} was unwhitelisted for links list by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		daily: {
			async action(message) {
				let room = this.room;
				let split = message.split(',');
				if (!room) {
					[room, ...split] = split;
					room = toId(room);
					if (!split.length || !this.userlists[room]) return this.pmreply("You need to specify the room when using this command in PMs.");
					if (!this.getRoomAuth(room)) return;
				}
				let [key, ...rest] = split;
				key = toId(key);
				if (!key) return this.pmreply("No topic specified.");

				let text, image;
				let permission = false;

				if (rest.length) {
					if (!this.canUse(2)) return this.pmreply("Permission denied.");
					permission = true;
					if (toId(rest[0]) === 'clear') {
						dailyCache.deleteProperty(room, key);
						dailyCache.write();
						return Connection.send(`${room}|/modnote The daily ${key} was cleared by ${this.username}`);
					}
					if (validUrl.isWebUri(rest[0].trim())) {
						image = rest[0].trim();
						rest = rest.slice(1);
					}
					text = rest.join(',').trim();
					dailyCache.setProperty(room, key, {text: text, image: image});
					dailyCache.write();
					Connection.send(`${room}|/modnote ${this.username} set the daily ${key} to '${text}'${image ? ` (${image})` : ''}`);
				} else {
					if (this.canUse(1)) permission = true;
					if (!(key in dailyCache.get(room))) return this.pmreply("Invalid topic");
					let entry = dailyCache.get(room)[key];
					text = entry.text;
					image = entry.image;
				}

				let maxWidth = 600;
				let maxHeight = 150;

				if (!image) {
					maxWidth = 100;
					maxHeight = 100;
					image = 'http://bumba.me/logo.png';
				}
				let width, height;
				let dimensions = await fitImage(image, maxHeight, maxWidth).catch(() => {});
				if (dimensions) {
					[width, height] = dimensions;
				} else {
					image = 'http://bumba.me/logo.png';
					[width, height] = await fitImage(image, 100, 100);
				}

				const html = `<table style="text-align:center;margin:auto"><tr><td style="padding-right:10px;">${escapeHTML(text)}</td><td><img src="${image}" width="${width}" height="${height}"/></td></tr></table>`;

				if (this.room && permission) return this.reply(`/addhtmlbox ${html}`);

				return Connection.send(`${room}|/pminfobox ${this.userid}, ${html}`);
			},
		},
	},
	analyzer: {
		async parser(message) {
			if (!this.options.includes('imagethumbnails')) return;

			let match;
			while ((match = linkRegex.exec(message)) !== null) {
				if (validUrl.isWebUri(match[0])) {
					if (match[0].includes("deviantart.com")) continue; // dA links render as images for some reason
					let dimensions = await fitImage(match[0], 120, 500).catch(() => {});
					if (dimensions) return Connection.send(`${this.room}|/addhtmlbox <a href="${match[0]}"><img src="${match[0]}" width="${dimensions[0]}" height="${dimensions[1]}"/></a>`);
				}
			}
		},
	},
};
