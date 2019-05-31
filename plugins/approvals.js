const probe = require('probe-image-size');
const validUrl = require('valid-url');

const redis = require('../redis.js');
const ytApi = require('../utils/youtube-api.js');

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
const VIDEO_ROOT = 'https://youtu.be/';
const CHANNEL_ROOT = 'https://www.youtube.com/channel/';
const HOUR = 60 * 60 * 1000;
const VOICES_CAN_LINK = ['youtube', 'thecafe'];

const settings = redis.useDatabase('settings');

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

let lineCounter = 0;

const pendingApprovals = new Map();

const selfLinkTimeouts = new Map();
const lastLinked = new Map();

async function draw(user, data, desc, self) {
	switch (this.room) {
	case YOUTUBE_ROOM:
		return ChatHandler.send(this.room, `/addhtmlbox <table><tbody><tr><td style="padding-right: 5px"><img src="${data.thumbnail}" width="120" height="90"></td><td><b><a href=${VIDEO_ROOT}${data.id}>${data.title}</a></b><br/>Uploaded ${data.date.toDateString()} by <b><a href="${CHANNEL_ROOT}${data.channelUrl}">${data.channel}</a></b><br/><b>${data.views}</b> views, <b><span style="color:green">${data.likes}</span> | <span style="color:red">${data.dislikes}</span></b><br/>${desc ? `<i>${escapeHTML(desc)}</i><br/>` : ''}<details><summary>[Video Description]</summary><i>${escapeHTML(data.description).replace(/\n/g, '<br/>').replace(/click here/gi, 'go here')}</i></details></td></tr></tbody></table>`);
	default:
		return ChatHandler.send(this.room, `/addhtmlbox <a href="${data.url}"><img src="${data.url}" width="${data.width}" height="${data.height}"/></a>${desc ? `<br/><i>${escapeHTML(desc)}</i>` : ""}${self ? "" : `<br/><small>(Image suggested by ${user} and approved by ${this.username})</small>`}`);
	}
}

async function parse(room, url) {
	let data;
	switch (room) {
	case YOUTUBE_ROOM:
		let id = await ytApi.getVideoIdFromURL(url);
		if (!id) {
			this.reply("Invalid URL.");
			return false;
		}

		let videoInfo = await ytApi.getYoutubeVideoInfo(id);
		if (!videoInfo) {
			this.reply("Invalid youtube video.");
			return false;
		}
		videoInfo.url = url;

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
	options: [['imagethumbnails', "Show thumbnails for images linked in chat"]],
	commands: {
		requestapproval: {
			requireRoom: true,
			async action(message) {
				let [url, ...description] = message.split(',').map(param => param.trim());
				if (!url) return this.pmreply("Syntax: ``.requestapproval url, (optional) description``");

				if (pendingApprovals.has(this.room)) return this.reply("There is already someone awaiting approval.");

				if (description) {
					description = description.join(', ');
					if (description.length > 200) return this.reply("The description is too long.");
				}

				let data = await parse.call(this, this.room, url);
				if (!data) return;
				if (description) data.description = description;
				data.timeout = setTimeout(() => pendingApprovals.delete(this.room), HOUR);

				pendingApprovals.set(this.room, data);

				ChatHandler.send(this.room, `${this.username} wishes to have a link approved!`);
				ChatHandler.send(this.room, `/addrankhtmlbox %, ${this.username} wishes to get approval to post '<a href="${url}">${url}</a>' in the room${description ? ` (<i>${description}</i>)` : ''}.<br/> <button class="button" name="send" value="/pm ${Config.username}, .approve ${this.room}">Approve</button>&nbsp;<button class="button" name="send" value="/pm ${Config.username}, .reject ${this.room}">Reject</button>`);
			},
		},
		approve: {
			hidden: true,
			requireRoom: true,
			permission: 2,
			async action() {
				if (!pendingApprovals.has(this.room)) return this.pmreply("There is nothing to approve.");

				let {user, data, description, timeout} = pendingApprovals.get(this.room);
				ChatHandler.send(this.room, `/modnote ${this.username} approved ${user}'s link: ${data.url}`);
				clearTimeout(timeout);
				pendingApprovals.delete(this.room);
				await draw.call(this, user, data, description);
			},
		},
		link: {
			hidden: true,
			disallowPM: true,
			async action(message) {
				if (!(this.canUse(VOICES_CAN_LINK.includes(this.room) ? 1 : 2))) {
					if (!(await settings.hexists(`whitelist:${this.room}`, this.userid))) return this.pmreply("Permission denied.");
					if (this.room === YOUTUBE_ROOM) {
						if (selfLinkTimeouts.has(this.userid)) return this.reply("You are only allowed to post your own link once per two hours.");
						if (lastLinked.has(this.userid) && lineCounter - lastLinked.get(this.userid) < 50) return this.reply("You need to wait at least 50 lines before linking another video.");
					}
				}
				let [url, ...description] = message.split(',').map(param => param.trim());
				if (description) {
					description = description.join(', ');
					if (description.length > 200) return this.reply("The description is too long.");
				}
				let {user, data} = await parse.call(this, this.room, url);
				if (!user) return;
				if (this.room === YOUTUBE_ROOM && !this.canUse(1)) selfLinkTimeouts.set(this.userid, setTimeout(() => selfLinkTimeouts.delete(this.userid), 2 * HOUR));
				draw.call(this, this.username, data, description, true);
			},
		},
		reject: {
			hidden: true,
			requireRoom: true,
			permission: 2,
			async action() {
				if (!pendingApprovals.has(this.room)) return this.pmreply("There is nothing to reject.");

				let {user, data, timeout} = pendingApprovals.get(this.room);
				pendingApprovals.delete(this.room);

				clearTimeout(timeout);
				ChatHandler.sendPM(user, `Your link was rejected.`);
				return this.reply(`/modnote ${this.username} rejected ${user}'s link: ${data.url}`);
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
				ChatHandler.send(room, `/modnote ${toId(user)} was whitelisted for links by ${this.username}.`);
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
				ChatHandler.send(room, `/modnote ${toId(user)} was unwhitelisted for links list by ${this.username}.`);
				return this.reply("User successfully removed from the whitelist.");
			},
		},
		viewwhitelist: {
			requireRoom: true,
			permission: 2,
			async action() {
				const whitelist = await settings.hgetall(`whitelist:${this.room}`);

				const values = Object.values(whitelist);

				if (values.length) {
					this.replyHTML(`Whitelisted user${values.length > 1 ? 's' : ''} in room ${this.room}: ${values.join(', ')}`, true);
				} else {
					this.pmreply("This room has no whitelist.");
				}
			},
		},
		daily: {
			async action() {
				return this.reply("Use /daily");
			},
		},
	},
	analyzer: {
		async parser(message) {
			if (this.room === YOUTUBE_ROOM) lineCounter++;
			if (!this.options.includes('imagethumbnails')) return;

			let match;
			while ((match = linkRegex.exec(message)) !== null) {
				if (validUrl.isWebUri(match[0])) {
					if (match[0].includes("deviantart.com")) continue; // dA links render as images for some reason
					let dimensions = await fitImage(match[0], 120, 500).catch(() => {});
					if (dimensions) return ChatHandler.send(this.room, `/addhtmlbox <a href="${match[0]}"><img src="${match[0]}" width="${dimensions[0]}" height="${dimensions[1]}"/></a>`);
				}
			}
		},
	},
};
