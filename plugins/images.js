const imageSize = require('image-size');
const validUrl = require('valid-url');
const request = require('request');

const COSMO = 'cosmopolitan';
const YOUTUBE_ROOM = 'youtube';
const YT_ROOT = 'https://www.googleapis.com/youtube/v3/videos';
const VIDEO_ROOT = 'https://youtu.be/';
const CHANNEL_ROOT = 'https://www.youtube.com/channel/';

function getImageSize(url) {
	return new Promise((resolve, reject) => {
		const res = request(url);

		res.on('error', err => {
			reject(err.stack);
		});

		res.on('data', data => {
			resolve(imageSize(data));
			res.abort();
		});
	});
}

async function fitImage(url, maxHeight = 300, maxWidth = 400) {
	let {height, width} = await getImageSize(url);

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

				switch (room) {
				case YOUTUBE_ROOM:
					let id = '';
					let idx = url.indexOf('youtu.be/');
					if (idx > -1) {
						id = url.substr(idx + 9);
					} else {
						let idx = url.indexOf('?v=');
						if (idx < 0) return this.reply("Invalid url.");
						id = url.substr(idx + 3);
					}
					id = id.split('&')[0];

					let videoInfo = await getYoutubeVideoInfo(id);
					if (!videoInfo) return this.reply("Invalid youtube video.");

					pendingApprovals.set(room, {user: this.username, data: videoInfo});
					break;
				default:
					if (!/^https?:\/\//.test(url)) url = `http://${url}`;
					if (!validUrl.isWebUri(url)) return this.reply("That's not a valid URL.");

					pendingApprovals.set(room, {user: this.username, data: url});
				}

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
				switch (this.room) {
				case YOUTUBE_ROOM:
					pendingApprovals.delete(this.room);
					return this.reply(`/addhtmlbox <table><tbody><tr><td style="padding-right: 5px"><img src="${data.thumbnail}" width="120" height="90"></td><td><b><a href=${VIDEO_ROOT}${data.id}>${data.title}</a></b><br/>Uploaded ${data.date.toDateString()} by <b><a href="${CHANNEL_ROOT}${data.channelUrl}">${data.channel}</a></b><br/><b>${data.views}</b> views, <b><span style="color:green">${data.likes}</span> | <span style="color:red">${data.dislikes}</span></b><br/><i>${data.description.substr(0, 300).replace(/\n/g, '<br/>')}</i></td></tr></tbody></table>`);
				default:
					let [width, height] = await fitImage(data).catch(() => this.reply("Something went wrong getting dimensions of the image."));

					pendingApprovals.delete(this.room);
					if (!(width && height)) return;
					return this.reply(`/addhtmlbox <a href="${data}"><img src="${data}" width="${Math.round(width)}" height="${Math.round(height)}"/></a><br/><small>(Image suggested by ${user} and approved by ${this.username})</small>`);
				}
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

				return this.reply(`/modnote ${this.username} rejected ${user}'s image.`);
			},
		},
	},
};
