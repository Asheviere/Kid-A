const request = require('request');

const redis = require('../redis.js');
const server = require('../server.js');
const Page = require('../page.js');

// Define constants
const YOUTUBE_ROOM = 'youtube';
const YTAPI_ROOT = 'https://www.googleapis.com/youtube/v3/channels';
const YT_ROOT = 'https://www.youtube.com/';
const INVALIDATION_TIME = 12 * 60 * 60 * 1000;
const REPEAT_INTERVAL = 4 * 60 * 60 * 1000;

class YoutubePlugin {
	constructor() {
		this.cache = new Map();
		this.db = redis.useDatabase('settings');

		// Populate the cache with all keys. Lazily load data by setting lastUpdated to 0
		// so any query requests the data.
		this.db.hgetall(`${YOUTUBE_ROOM}:channels`).then(obj => {
			for (const key in obj) {
				this.cache.set(key, {lastUpdated: 0, username: obj[key]});
			}
		});

		this.page = new Page('channels', this.pageGenerator.bind(this), 'youtube.html', {rooms: [YOUTUBE_ROOM]});

		setInterval(async () => {
			if (!this.cache.size) return;
			Connection.send(`${YOUTUBE_ROOM}|/adduhtml channelrepeat, ${await this.getHTML(this.getRandomId())}`);
		}, REPEAT_INTERVAL);
	}

	getRandomId() {
		const keys = [...this.cache.keys()];
		return keys[Math.floor(Math.random() * keys.length)];
	}

	async addChannel(channelId, username = 'false') {
		// This is needed to make sure the channel actually exists. It doesn't hurt to immediately cache this either.
		const channelInfo = await this.queryChannelInfo(channelId);

		if (!channelInfo) return false;

		this.cache.set(channelId, Object.assign({lastUpdated: Date.now(), username: username}, channelInfo));
		this.db.hset(`${YOUTUBE_ROOM}:channels`, channelId, username);
		return true;
	}

	async removeChannel(channelId) {
		if (!this.cache.has(channelId)) return false;

		this.cache.delete(channelId);
		this.db.hdel(`${YOUTUBE_ROOM}:channels`, channelId);
		return true;
	}

	async updateUsername(channelId, newUsername = 'false') {
		if (!this.cache.has(channelId)) return false;

		const info = this.cache.get(channelId);
		info.username = newUsername;
		this.db.hset(`${YOUTUBE_ROOM}:channels`, channelId, newUsername);
		return true;
	}

	async getHTML(channelId) {
		let channelInfo = this.cache.get(channelId);
		// Return false if channel is not found. The command will provide a fitting error message.
		if (!channelInfo) return false;
		// Make another query for channel data if data is outdated.
		if (channelInfo.lastUpdated < Date.now() - INVALIDATION_TIME) {
			const res = await this.queryChannelInfo(channelId);
			if (!res) {
				this.removeChannel(channelId);
				return false;
			}
			const newInfo = Object.assign({lastUpdated: Date.now(), username: channelInfo.username}, res);
			this.cache.set(channelId, newInfo);
			channelInfo = newInfo;
		}

		return `<div style="background:rgba(230,230,230,0.4);font-family:'Segoe UI', 'Segoe', 'Liberation Sans', 'Arial', sans-serif;"><table style="margin:0px;"><tr><td style="margin:5px;padding:5px;background:rgba(120,120,120, 0.15);min-width:175px;max-width:160px;text-align:center;border-bottom:0px;"><div style="padding:5px;background:white;border:1px solid black;margin:auto;max-width:100px;max-height:100px;"><a href="${YT_ROOT}channel/${channelId}"><img src="${channelInfo.icon}" width=100px height=100px/></a></div><p style="margin:5px 0px 4px 0px;word-wrap:break-word;"><a style="font-weight:bold;color: #151515;font-size:12pt;text-decoration:underline #e22828;" href="${YT_ROOT}${channelInfo.url ? `user/${channelInfo.url}` : `channel/${channelId}`}">${channelInfo.name}</a></p></td><td style="padding: 0px 25px;font-size:10pt;background:rgba(255,255,255,0.7);width:100%;border-bottom:0px;vertical-align:top;"><p style="background: #e22828; padding: 5px;border-radius:8px;color:white;font-weight:bold;">${channelInfo.videoCount} videos | ${channelInfo.subscriberCount} subscribers | ${channelInfo.viewCount} video views</p><p style="margin-left: 5px; font-size:9pt;">${channelInfo.description.slice(0, 500)}</p>${channelInfo.username !== 'false' ? `<p style="text-align:right;font-style:italic">PS Username: ${channelInfo.username}</p>` : ''}</td></tr></table></div>`;
	}

	async queryChannelInfo(channelId) {
		const queryUrl = `${YTAPI_ROOT}?part=snippet%2Cstatistics&id=${encodeURIComponent(channelId)}&key=${Config.youtubeKey}`;

		const query = new Promise(function(resolve, reject) {
			request(queryUrl, function(error, response, body) {
				if (error) {
					errorMsg(error);
					reject(error);
				} else {
					resolve(JSON.parse(body));
				}
			});
		});

		const res = await query.catch(() => {});
		if (res.error) {
			errorMsg(res.error.message);
			return false;
		}
		if (!res.items.length) return false;

		const channelInfo = res.items[0];
		return {
			name: channelInfo.snippet.title,
			description: channelInfo.snippet.description,
			url: channelInfo.snippet.customUrl,
			icon: channelInfo.snippet.thumbnails.medium.url,
			videoCount: Number(channelInfo.statistics.videoCount),
			subscriberCount: Number(channelInfo.statistics.subscriberCount),
			viewCount: Number(channelInfo.statistics.viewCount),
		};
	}

	async pageGenerator(room, query) {
		const showAll = query.view === 'all';

		const entries = [];
		for (const [key, value] of this.cache.entries()) {
			if (!showAll && value.username === 'false') continue;
			entries.push(this.getHTML(key));
		}
		// Kinda hacky, but can't use a .map() for this because async garbage.
		for (let i = 0; i < entries.length; i++) {
			entries[i] = await entries[i];
		}

		return entries;
	}
}

const plugin = new YoutubePlugin();

module.exports = {
	commands: {
		addchannel: {
			rooms: [YOUTUBE_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(YOUTUBE_ROOM)) return;
				}
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				let [channelId, username] = message.split(',').map(param => param.trim());
				if (!channelId) return this.reply('Syntax: ``.addchannel channel id, username``');
				if (plugin.cache.has(channelId)) return this.reply('This channel has already been added.');
				if (!username) username = 'false';
				if (!(await plugin.addChannel(channelId, username))) return this.reply(`Invalid channel id: ${channelId}`);

				Connection.send(`${YOUTUBE_ROOM}|/modnote ${this.username} added a youtube channel${username !== 'false' ? ` for ${username}` : ''}: ${YT_ROOT}channel/${channelId}`);
				return this.reply("Channel successfully added.");
			},
		},
		removechannel: {
			rooms: [YOUTUBE_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(YOUTUBE_ROOM)) return;
				}
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				if (!(await plugin.removeChannel(message))) return this.reply("Channel not found in database.");

				Connection.send(`${YOUTUBE_ROOM}|/modnote ${this.username} removed a youtube channel: ${YT_ROOT}channel/${message}`);
				return this.reply("Channel successfully removed.");
			},
		},
		updatechannel: {
			rooms: [YOUTUBE_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(YOUTUBE_ROOM)) return;
				}
				if (!this.canUse(4)) return this.pmreply("Permission denied.");

				let [channelId, username] = message.split(',').map(param => param.trim());
				if (!channelId || !username) return this.reply('Syntax: ``.updatechannel channel id, username``');
				if (!(await plugin.updateUsername(channelId, username))) return this.reply("Channel not found in database.");

				return this.reply("Username successfully updated.");
			},
		},
		randchannel: {
			rooms: [YOUTUBE_ROOM],
			permission: 1,
			async action() {
				if (!plugin.cache.size) return this.reply("There are no channels in the database.");
				Connection.send(`${YOUTUBE_ROOM}|/${this.room ? 'addhtmlbox' : `pminfobox ${this.userid},`} ${await plugin.getHTML(plugin.getRandomId())}`);
			},
		},
		viewchannels: {
			rooms: [YOUTUBE_ROOM],
			permission: 1,
			async action(message) {
				this.reply(`${server.url}${YOUTUBE_ROOM}/channels${message === 'all' ? '?view=all' : ''}`);
			},
		},
		channelhelp: {
			rooms: [YOUTUBE_ROOM],
			async action() {
				Connection.send(`${YOUTUBE_ROOM}|/${this.canUse(1) ? `addhtmlbox` : `pminfobox ${this.userid},`} <p style="font-weight:bold;">Youtube channel plugin commands:</p>` +
					`<p><code>.addchannel channel id, [username]</code> - Adds a channel to the database. Username is the PS username of the channel owner. Omit the username argument if this is a channel that isn't owned by a PS user. Requires @ or #.</p>` +
					`<p><code>.removechannel channel id</code> - Removes the channel with this channel id from the database. Requires @ or #.</p>` +
					`<p><code>.updatechannel channel id, new username</code> - Updates the PS username attached to the channel with the given channel id. Requires @ or #.</p>` +
					`<p><code>.randchannel</code> - Displays a random channel from the database. Requires + to use in chat, and works for everyone in PM.</p>` +
					`<p><code>.viewchannels</code> - Sends you a link to view all the channels in the database. By default only shows channels of PS users, however shows all channels if the command <code>.viewchannels all</code> is used. Requires + to use in chat, and works for everyone in PM.</p>`);
			},
		},
	},
};
