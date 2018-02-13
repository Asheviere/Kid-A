'use strict';

const request = require('request');

const redis = require('../redis.js');

let db = redis.useDatabase('lastfm');

const API_ROOT = 'http://ws.audioscrobbler.com/2.0/';
const YT_ROOT = 'https://www.googleapis.com/youtube/v3/search';
const VIDEO_ROOT = 'https://youtu.be/';

module.exports = {
	options: ['lastfmhtmlbox'],
	commands: {
		lastfm: {
			permission: 1,
			async action(message) {
				if (!Config.lastfmKey) return errorMsg("No last.fm API key found.");

				let accountname = message || this.username;
				if (!message && (await db.exists(this.userid))) message = await db.get(this.userid);
				if (!message) message = this.userid;

				let options = await this.settings.lrange(`${this.room}:options`, 0, -1);

				let htmlbox = options && options.includes('lastfmhtmlbox');

				let url = API_ROOT + '?method=user.getrecenttracks&user=' + message + '&limit=1&api_key=' + Config.lastfmKey + '&format=json';
				let req = new Promise(function(resolve, reject) {
					request(url, function(error, response, body) {
						if (error) {
							errorMsg(error);
							reject(error);
						} else {
							resolve(JSON.parse(body));
						}
					});
				});

				return req.then(data => {
					let msg = '';
					if (htmlbox) {
						msg += '<table><tr><td style="padding-right:5px;">';
					}
					if (data.recenttracks && data.recenttracks.track && data.recenttracks.track.length) {
						let track = data.recenttracks.track[0];
						if (htmlbox) {
							if (track.image && track.image.length) {
								let imageIdx = (track.image.length >= 3 ? 2 : track.image.length - 1);
								if (track.image[imageIdx]['#text']) {
									msg += '<img src="' + track.image[imageIdx]['#text'] + '" width=75 height=75>';
								}
							}
							msg += '</td><td>';
							msg += '<a href="http://www.last.fm/user/' + message + '"><b>' + accountname + '</b></a>';
						} else {
							msg += accountname;
						}
						if (track['@attr'] && track['@attr'].nowplaying) {
							msg += " is currently listening to: ";
						} else {
							msg += " was last seen listening to: ";
						}
						if (htmlbox) msg += '<br/>';
						let trackname = '';
						// Should always be the case but just in case.
						if (track.artist && track.artist['#text']) {
							trackname += track.artist['#text'] + ' - ';
						}
						trackname += track.name;
						if (!htmlbox) msg += trackname;
						let yturl = YT_ROOT + '?part=snippet&order=relevance&maxResults=1&q=' + encodeURIComponent(trackname) + '&key=' + Config.youtubeKey;
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

						return yt.then(video => {
							if (video.error) {
								errorMsg(video.error.message);
								msg = 'Something went wrong with the youtube API.';
							} else if (video.items && video.items.length && video.items[0].id) {
								if (htmlbox) {
									msg += '<a href="' + VIDEO_ROOT + video.items[0].id.videoId + '">' + trackname + '</a>';
								} else {
									msg += ' ' + VIDEO_ROOT + video.items[0].id.videoId;
									msg += ' | Profile link: http://www.last.fm/user/' + message;
								}
							} else if (htmlbox) {
								// Since the htmlbox doesn't actually write down the trackname yet.
								msg += trackname;
							}

							if (htmlbox) msg = '/addhtmlbox ' + msg + '</td></tr></table>';
							return this.reply(msg);
						});
					} else if (data.error) {
						return this.reply(data.message + '.');
					}

					return this.reply(message + ' doesn\'t seem to have listened to anything recently.');
				});
			},
		},

		track: {
			permission: 1,
			async action(message) {
				if (!Config.lastfmKey) return errorMsg("No last.fm API key found.");

				let parts = message.split('-').map(param => encodeURIComponent(param.trim()));
				if (parts.length !== 2) return this.pmreply("Invalid syntax. Format: ``.track Artist - Song name``");

				let options = await this.settings.lrange(`${this.room}:options`, 0, -1);

				let htmlbox = options && options.includes('lastfmhtmlbox');

				let url = API_ROOT + '?method=track.getInfo&api_key=' + Config.lastfmKey + '&artist=' + parts[0] + '&track=' + parts[1] + '&autocorrect=1&format=json';
				let req = new Promise(function(resolve, reject) {
					request(url, function(error, response, body) {
						if (error) {
							errorMsg(error);
							reject(error);
						} else {
							resolve(JSON.parse(body));
						}
					});
				});

				return req.then(data => {
					let msg = '';
					if (htmlbox) {
						msg += '<table><tr><td style="padding-right:5px;">';
					}
					if (data.track) {
						let track = data.track;
						let name = track.name || "Untitled";
						let artist = track.artist.name || "Unknown Artist";
						let trackname = artist + ' - ' + name;
						if (htmlbox) {
							if (track.album && track.album.image && track.album.image.length) {
								let img = track.album.image;
								let imageIdx = (img.length >= 3 ? 2 : img.length - 1);
								if (img[imageIdx]['#text']) {
									msg += '<a href="' + track.album.url + '"><img src="' + img[imageIdx]['#text'] + '" width=75 height=75></a>';
								}
							}
							msg += '</td><td>';
							msg += '<b><a href="' + track.artist.url + '">' + artist + '</a> - <a href="' + track.url + '">' + name + '</a></b><br/>';
						} else {
							msg += trackname;
						}
						let yturl = YT_ROOT + '?part=snippet&order=relevance&maxResults=1&q=' + encodeURIComponent(trackname) + '&key=' + Config.youtubeKey;

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
						return yt.then(video => {
							if (video.error) {
								errorMsg(video.error.message);
								msg = 'Something went wrong with the youtube API.';
							} else if (video.items && video.items.length && video.items[0].id) {
								if (htmlbox) {
									msg += '<a href="' + VIDEO_ROOT + video.items[0].id.videoId + '">Youtube link</a>';
								} else {
									msg += ' ' + VIDEO_ROOT + video.items[0].id.videoId;
								}
							} else if (htmlbox) {
								// Since the htmlbox doesn't actually write down the trackname yet.
								msg += trackname;
							}

							if (htmlbox) msg = '/addhtmlbox ' + msg + '</td></tr></table>';
							return this.reply(msg);
						});
					}

					return this.reply(data.message + '.');
				});
			},
		},

		registerlastfm: {
			hidden: true,
			async action(message) {
				if (!message) return this.pmreply("No username entered.");

				let username = message.replace(/[^A-Za-z0-9-_]/g, '');

				await db.set(this.userid, username);

				this.pmreply(`You've been registered as ${username}.`);
			},
		},
	},
};

