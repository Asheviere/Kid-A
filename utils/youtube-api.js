const request = require('request');

const YT_ROOT = 'https://www.googleapis.com/youtube/v3/';
const CHANNELS = `${YT_ROOT}channels`;
const SEARCH = `${YT_ROOT}search`;
const VIDEOS = `${YT_ROOT}videos`;

module.exports = {
	async getYoutubeChannelTrailer(type, id) {
		let yturl = `${CHANNELS}?part=brandingSettings&${type}=${encodeURIComponent(id)}&key=${Config.youtubeKey}`;

		let yt = new Promise(function(resolve, reject) {
			request(yturl, function(error, response, body) {
				if (error) {
					Output.errorMsg(error, 'Error in YouTube request', {url: yturl});
					reject(error);
				} else {
					resolve(JSON.parse(body));
				}
			});
		});

		let channel = await yt;

		if (channel.error) {
			Output.log('ytapi', channel.error.message);
			return false;
		} else if (channel.items && channel.items.length) {
			return channel.items[0].brandingSettings.channel.unsubscribedTrailer;
		}
	},
	async getVideoIdFromURL(url) {
		let id = '';
		let idx = url.indexOf('youtu.be/');
		if (idx > -1) {
			id = url.substr(idx + 9);
		} else {
			idx = url.indexOf('?v=');
			if (idx < 0) {
				let type = 'forUsername';
				idx = url.indexOf('/user/');
				if (idx < 0) {
					idx = url.indexOf('/channel/');
					if (idx < 0) {
						const customindex = url.indexOf('/c/');
						if (customindex > -1) {
							const promise = new Promise(resolve => {
								request(`http://youtube.com/${url.slice(customindex + 3)}`, (err, response, body) => {
									const regex = new RegExp('data-channel-external-id="([a-zA-Z0-9]+)" ', 'g');
									const match = regex.exec(body);
									if (match) resolve(match[1]);

									resolve(false);
								});
							});
							id = await promise;
						} else {
							return false;
						}
					} else {
						id = url.substr(idx + 9);
					}
					type = 'id';
				} else {
					id = url.substr(idx + 6);
				}
				id = await this.getYoutubeChannelTrailer(type, id);
				if (!id) {
					return false;
				}
			} else {
				id = url.substr(idx + 3);
			}
		}
		id = id.split('&')[0];

		return id;
	},
	async getYoutubeVideoInfo(id) {
		let yturl = `${VIDEOS}?part=snippet%2Cstatistics&id=${encodeURIComponent(id)}&key=${Config.youtubeKey}`;

		let yt = new Promise(function(resolve, reject) {
			request(yturl, function(error, response, body) {
				if (error) {
					Output.errorMsg(error, 'Error in YouTube request', {url: yturl});
					reject(error);
				} else {
					resolve(JSON.parse(body));
				}
			});
		});

		let video = await yt;

		if (video.error) {
			Output.log('ytapi', video.error.message);
			return false;
		} else if (video.items && video.items.length && video.items[0].id) {
			video = video.items[0];
			return {id: video.id, title: video.snippet.title, date: new Date(video.snippet.publishedAt), description: video.snippet.description, channel: video.snippet.channelTitle, channelUrl: video.snippet.channelId, views: video.statistics.viewCount, thumbnail: video.snippet.thumbnails.default.url, likes: video.statistics.likeCount, dislikes: video.statistics.dislikeCount};
		}
	},
	async queryChannelInfo(channelId) {
		const queryUrl = `${CHANNELS}?part=snippet%2Cstatistics&id=${encodeURIComponent(channelId)}&key=${Config.youtubeKey}`;

		const query = new Promise(function(resolve, reject) {
			request(queryUrl, function(error, response, body) {
				if (error) {
					Output.errorMsg(error, 'Error in YouTube query request', {url: queryUrl});
					reject(error);
				} else {
					resolve(JSON.parse(body));
				}
			});
		});

		const res = await query.catch(() => {});
		if (res.error) {
			Output.log('ytapi', res.error.message);
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
	},
	async searchVideo(query) {
		const queryUrl = `${SEARCH}?part=snippet&order=relevance&maxResults=1&q=${encodeURIComponent(query)}&key=${Config.youtubeKey}`;

		const ytQuery = new Promise(function(resolve, reject) {
			request(queryUrl, function(error, response, body) {
				if (error) {
					Output.errorMsg(error, 'Error in YouTube request', {url: queryUrl});
					reject(error);
				} else {
					resolve(JSON.parse(body));
				}
			});
		});

		let video = await ytQuery;

		if (video.error) {
			Output.log('ytapi', video.error.message);
			return false;
		} else if (video.items && video.items.length && video.items[0].id) {
			return video.items[0].id.videoId;
		}
	},
};

