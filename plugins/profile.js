const fs = require('fs');
const md = require('markdown').markdown;
const {Image} = require('image-js');

const server = require('../server.js');
const Page = require('../page.js');
const redis = require('../redis.js');
const handlebars = require('handlebars');

const profileData = redis.useDatabase('profiles');
const lastfmData = redis.useDatabase('lastfm');

const AVATAR_URL = `https://play.pokemonshowdown.com/sprites/trainers/`;
const CUSTOM_AVATAR_URL = `https://play.pokemonshowdown.com/sprites/trainers-custom/`;
const BADGE_DIR = './public/badges/';
const DEFAULT_BADGE_COLOR = [[72, 255, 106], [0, 212, 20], [0, 106, 20]];
const WIFI_ROOM = 'wifi';

const badges = new Map();

const badgeColors = {
	red: [[223, 130, 130], [213, 18, 18], [135, 18, 18]],
	blue: [[78, 133, 215], [31, 62, 212], [31, 62, 85]],
	green: [[75, 234, 138], [57, 178, 106], [26, 122, 60]],
	pika: [[255, 247, 165], [247, 231, 82], [222, 148, 0]],
	kawaii: [[234, 135, 200], [234, 49, 200], [143, 30, 12]],
	gold: [[226, 185, 118], [234, 162, 44], [157, 108, 29]],
	silver: [[242, 243, 250], [195, 212, 218], [124, 124, 128]],
	crystal: [[177, 214, 236], [130, 210, 236], [77, 148, 181]],
};

handlebars.registerHelper('get_avatar', function(avatar) {
	if (!avatar) return "&nbsp;";
	const avatarUrl = avatar.startsWith('#') ? `${CUSTOM_AVATAR_URL}${avatar.slice(1)}.png` : `${AVATAR_URL}${avatar}.png`;
	return `<img src="${avatarUrl}" width=80 height=80 style="margin:5px;">`;
});

// Edit 0 means invisible, 1 means visible on card but not editable, 2 means visible and settable.
const allFields = {
	avatar: {
		edit: () => 0,
		calculated: true,
	},
	username: {
		title: "Username",
		edit: () => 0,
	},
	discord: {
		title: "Discord Username",
		validation: username => /.{2,32}#[0-9]{4}/.test(username),
		edit: () => 2,
	},
	steam: {
		title: "Steam",
		validation: url => /https?:\/\/steamcommunity.com\/(id|profiles)\/[a-zA-Z0-9]+\/?/.test(url),
		display: url => `<small><a href="${url}">${url.replace(/https?:\/\/steamcommunity.com/g, '')}</a></small>`,
		helptext: "Steam Profile URL",
		edit: () => 2,
	},
	smogon: {
		title: "Smogon Profile",
		validation: username => /[a-z0-9]+\.[0-9]{1,7}/.test(username),
		display: username => {
			const [name] = username.split('.');
			return `<a href="https://www.smogon.com/forums/members/${username}">${name}</a>`;
		},
		helptext: "Smogon Account (username.numbers, as shown in your profile URL)",
		edit: () => 2,
	},
	youtube: {
		title: "YouTube channel",
		validation: url => /https?:\/\/(www\.)?youtube\.com\/(c|channel|user)\/[a-zA-Z0-9-_]+/.test(url),
		display: url => `<small><a href="${url}">${url.replace(/https?:\/\/(www\.)?youtube\.com/g, '')}</a></small>`,
		edit: () => 2,
	},
	twitch: {
		title: "Twitch.tv Username",
		validation: username => /[a-zA-Z0-9_-]+/.test(username) && username.length < 25,
		display: username => `<a href="https://twitch.tv/${username}">${username}</a>`,
		edit: () => 2,
	},
	gamertag: {
		title: "Gamertag",
		validation: username => /[a-zA-Z0-9_]+/.test(username) && username.length < 16,
		helptext: "Xbox Gamertag",
		edit: () => 2,
	},
	psn: {
		title: "PSN",
		validation: username => /[a-zA-Z0-9_]+/.test(username) && username.length < 25,
		helptext: "PlayStation Network Username",
		edit: () => 2,
	},
	switchfc: {
		title: "Switch Friendcode",
		validation: fc => /SW-[0-9]{4}-[0-9]{4}-[0-9]{4}/.test(fc),
		edit: () => 2,
	},
	github: {
		title: "Github",
		validation: username => username,
		display: username => `<a href="https://github.com/${username}">${Utils.sanitize(username)}</a>`,
		helptext: "Github Username",
		edit: () => 2,
	},
	reddit: {
		title: "Reddit",
		validation: username => /(\/?u\/)?[a-zA-Z0-9_-]{3,20}/.test(username),
		display: username => {
			if (username.startsWith('/')) username = username.slice(1);
			if (!username.startsWith('u/')) username = 'u/' + username;
			return `<a href="https://reddit.com/${username}">${username}</a>`;
		},
		helptext: "Reddit Username",
		edit: () => 2,
	},
	twitter: {
		title: "Twitter Username",
		validation: username => /@?[a-zA-Z0-9_]{1,16}/.test(username),
		display: username => {
			if (username.startsWith('@')) username = username.slice(1);
			return `<a href="https://twitter.com/${username}">@${username}</a>`;
		},
		edit: () => 2,
	},

	//wifi fields

	wifiign: {
		title: "In-Game Name",
		validation: username => /[a-zA-Z0-9]+/.test(username) && username.length < 20,
		edit: () => 0,
	},
	wificlonerinfo: {
		title: "Cloner Information",
		validation: info => info.length < 500,
		display: info => md.toHTML(info),
		cardDisplay: (info, profile) => `Approved cloner since ${(new Date(parseInt(profile.wificloneraddedtime))).toDateString()}.`,
		edit: profile => profile.wificloneraddedtime ? 2 : 1,
	},

	wifiscammerinfo: {
		title: "Scammer Information",
		validation: info => info.length < 500,
		display: info => md.toHTML(info),
		cardDisplay: () => "<b>(IS A WI-FI SCAMMER)</b>",
		edit: () => 1,
	},

	wifiscammerfingerprint: {
		edit: () => 0,
		calculated: true,
	},

	wifiscammeralts: {
		title: "Alts",
		edit: () => 0,
	},

	wifiscammeraddedtime: {
		edit: () => 0,
		calculated: true,
	},

	wifiscammeraddedby: {
		edit: () => 0,
		calculated: true,
	},

	wificloneraddedtime: {
		edit: () => 0,
		calculated: true,
	},

	wificlonerlastgatime: {
		title: "Last Giveaway",
		edit: () => 0,
		defaultValue: 0,
		calculated: true,
	},
};

ChatHandler.setProfileField = async function(userid, field, value) {
	if (!(field in allFields)) return false;
	if (!(await profileData.exists(userid))) return false;

	// return await so we don't get a double promise
	return await profileData.hset(field, value);
};

// For convenience
ChatHandler.getProfile = function(userid) {
	return profileData.hgetall(userid);
};

// I use this a lot
const queryProfile = ChatHandler.queryProfile = async function(query) {
	const keys = await profileData.keys('*');
	const output = {};

	for (const key of keys) {
		const profile = await profileData.hgetall(key);

		for (const field in query) {
			if (profile[field] && profile[field].includes(String(query[field]))) {
				output[key] = profile;
			}
		}
	}

	return output;
};

const editpage = new Page('editprofile', contextGenerator, 'editprofile.html', {token: 'profile', rooms: ['global'], postHandler: postHandler, postDataType: 'js'});

async function postHandler(data, room, tokenData) {
	const queryArgs = [];
	const profile = await profileData.hgetall(tokenData.user);

	for (let field in data) {
		if (field in allFields) {
			if (allFields[field].edit(profile) !== 2) continue;

			if (!data[field]) {
				queryArgs.push(field, '');
			} else if (allFields[field].validation(data[field])) {
				queryArgs.push(field, data[field]);
			}
		} else if (field === 'lastfm') {
			lastfmData.set(tokenData.user, data[field]);
		}
	}

	if (queryArgs.length) {
		queryArgs.unshift(tokenData.user);
		ChatHandler.query('userdetails', tokenData.user).then(details => {
			Debug.log(4, `Received query response: ${details}`);
			if (details && details.avatar) profileData.hset(tokenData.user, 'avatar', Utils.toAvatarId(details.avatar));
		});
		await profileData.hmset(...queryArgs);
	}
}

async function contextGenerator(room, query, tokenData) {
	let info = await profileData.hgetall(tokenData.user);
	let lastfm = await lastfmData.get(tokenData.user);

	const data = {lastfm: {
		label: "Last.fm Username",
		value: lastfm,
	}};
	for (let field in allFields) {
		if (allFields[field].edit(info) !== 2) continue;
		data[field] = {label: allFields[field].helptext || allFields[field].title, value: info[field] || ''};
	}

	return {user: tokenData.user, fields: data};
}

fs.readdir(BADGE_DIR, (err, files) => {
	if (err) throw err;

	for (let file of files) {
		Image.load(`${BADGE_DIR}${file}`).then(image => {
			badges.set(file.split('.')[0], image);
		});
	}
});

server.addRoute('/badges/badge.png', (req, res) => {
	let query = Page.parseURL(req.originalUrl);
	if (!(query.shape && query.color)) return;
	const toRecolor = badges.get(query.shape).clone();
	for (let i = 0; i < toRecolor.size; i++) {
		const colors = toRecolor.getPixel(i);
		for (let j = 0; j < DEFAULT_BADGE_COLOR.length; j++) {
			const otherColors = DEFAULT_BADGE_COLOR[j];
			if (colors[0] === otherColors[0] &&
				colors[1] === otherColors[1] &&
				colors[2] === otherColors[2]) {
				toRecolor.setPixel(i, badgeColors[query.color][j]);
			}
		}
	}

	res.end(Buffer.from(toRecolor.toBuffer()));
});

class List {
	constructor(id, queryObj, columnNames, options, filter) {
		this.id = id;
		this.queryObj = queryObj;
		this.filter = filter;
		this.columnNames = columnNames;

		// options
		this.roomid = options.roomid || 'global';
		this.fields = options.visibleFields || Object.keys(this.queryObj);
		if (options.whitelist) this.whitelistKey = `whitelist:${options.whitelist}`;
		this.addHandler = options.addHandler;
		this.noOnline = options.noOnline || false;

		this.settings = redis.useDatabase('settings');

		this.page = new Page('view/' + this.id, async () => {
			const output = {
				id: this.id,
				noOnline: this.noOnline,
				columnNames: this.columnNames,
				entries: {},
			};

			if (this.whitelistKey) output.editors = this.settings.lrange(this.whitelistKey, 0, -1).join(', ');
			const data = await this.get();

			for (const key in data) {
				const entryOut = {};
				for (const field in data[key]) {
					entryOut[field] = allFields[field].display ? allFields[field].display(data[key][field]) : data[key][field];
				}
				output.entries[key] = {online: (key in ChatHandler.userlists[this.roomid]), data: entryOut};
			}

			return output;
		}, 'list.html', {rooms: [this.roomid]});

		if (this.addHandler) {
			// Terrible way to cut off the plural but uhhh yeah it should work?
			this.addpage = new Page(`add/${this.id}`, async (room, query) => {
				const data = await profileData.hgetall(toId(query.user));
				const output = {id: this.id, fields: {}};

				for (const key of this.fields) {
					if (!allFields[key].calculated) {
						output.fields[key] = {
							label: allFields[key].helptext || allFields[key].title,
							value: data[key] || allFields[key].defaultValue || '',
						};
						if (key === 'username' && !output.fields[key].value) output.fields[key].value = query.user;
					}
				}

				return output;
			}, 'addlist.html', {token: `list:${this.id}`, rooms: [this.roomid], postHandler: async (data, room, tokenData, query) => {
				data = this.addHandler(data, tokenData);
				const userid = toId(query.user);
				const queryArgs = [];

				for (let field in data) {
					if (field in allFields) {
						if (!data[field]) {
							queryArgs.push(field, '');
						} else if (!allFields[field].validation || allFields[field].validation(data[field])) {
							queryArgs.push(field, data[field]);
						}
					} else if (field === 'lastfm') {
						lastfmData.set(userid, data[field]);
					}
				}

				if (queryArgs.length) {
					queryArgs.unshift(userid);
					ChatHandler.query('userdetails', userid).then(details => {
						Debug.log(4, `Received query response: ${details}`);
						if (details && details.avatar) profileData.hset(userid, 'avatar', Utils.toAvatarId(details.avatar));
					});
					await profileData.hmset(...queryArgs);
				}
			}, postDataType: 'js'});
		}
	}

	async get() {
		const queryRes = await queryProfile(this.queryObj);
		const output = {};

		for (const id in queryRes) {
			const profile = queryRes[id];
			for (const field of this.fields) {
				if (this.filter && !this.filter(profile, id)) continue;

				if (!output[id]) output[id] = {};
				output[id][field] = profile[field] || allFields[field].defaultValue || '';
			}
		}

		return output;
	}
}

const cloners = new List('cloners', {wificloneraddedtime: ''}, ["Avatar", "Username", "IGN", "Notes", "Last giveaway"], {roomid: 'wifi', visibleFields: ["avatar", "username", "wifiign", "wificlonerinfo", "wificlonerlastgatime"], addHandler: (data, tokenData) => {
	data.wificloneraddedtime = Date.now();
	data.wificlonerlastgatime = Date.now();
	data.wificloneraddedby = tokenData.user;

	return data;
}});

module.exports = {
	commands: {
		editprofile: {
			async action() {
				return this.pmreply(`Your edit link DO NOT SHARE THIS LINK: ${editpage.getUrl('global', this.userid)}`);
			},
		},
		deleteprofile: {
			hidden: true,
			async action(message) {
				if (!message) return this.pmreply("Syntax: ``.deleteprofile user``");
				message = toId(message);
				if (!this.canUse(3) && this.user !== message) return this.pmreply("Permission denied.");

				if (!(await profileData.exists(message))) return this.pmreply("User not found.");
				await profileData.del(message);
				return this.reply("Profile deleted.");
			},
		},
		profile: {
			permission: 1,
			async action(message) {
				const key = toId(message) || this.userid;
				const profile = await profileData.hgetall(key);

				let output = [];

				const lastfm = await lastfmData.get(key);
				if (lastfm) output.push(`<b>Last.fm:</b> <a href="https://last.fm/user/${encodeURIComponent(lastfm)}">${Utils.sanitize(lastfm)}</a>`);

				const fcs = redis.useDatabase('friendcodes');
				const fc = await fcs.get(key);
				if (fc) output.push(`<b>3DS Friendcode:</b> ${fc.split(':').join(', ')}`);

				if (!Object.keys(profile).length && !output.length) return this.reply("User not found.");

				for (let field in allFields) {
					if (allFields[field].edit(profile) > 0 && profile[field]) {
						output.push(`<b>${allFields[field].title}:</b> ${allFields[field].cardDisplay ? allFields[field].cardDisplay(profile[field], profile) : allFields[field].display ? allFields[field].display(profile[field]) : Utils.sanitize(profile[field])}`);
					}
				}

				const badges = await profileData.lrange(`badges:${key}`, 0, -1);
				if (badges.length) {
					const badgeHTML = [];
					for (let roomid of badges) {
						const badge = await redis.useDatabase('settings').hgetall(`badge:${roomid}`);
						let title = ChatHandler.rooms.get(roomid) || roomid;
						if (title.split(' ').length > 1) {
							title = Utils.abbreviate(title);
						} else {
							title = title.slice(0, 3);
						}
						badgeHTML.push(`<div style="width:20px;display:inline-block;vertical-align:middle;"><img title="${roomid}'s badge" width=18 height=18 src="${server.url}badges/badge.png?shape=${badge.shape || 'sun'}&color=${badge.color || 'green'}"><p style="word-wrap:break-word;margin:-3px auto;font-size:6pt;font-family:monospace;display:block;text-align:center;">${title}</p></div>`);
					}
					output.push(`<b>Badges:</b> ${badgeHTML.join('&nbsp;')}`);
				}

				const cols = [];

				if (profile.avatar) {
					const avatarUrl = profile.avatar.startsWith('#') ? `${CUSTOM_AVATAR_URL}${profile.avatar.slice(1)}.png` : `${AVATAR_URL}${profile.avatar}.png`;
					cols.push(`<img src="${avatarUrl}" width=80 height=80 style="margin:5px;">`);
				}

				for (let i = 0; i < output.length; i += 5) {
					cols.push(output.slice(i, i + 5).join('<br/>'));
				}

				return this.replyHTML(`<div style="width:100%;overflow-x:auto;display:inline-flex;">${cols.map(col => `<div style="margin:auto 5px auto 0px;${this.pm && !col.startsWith('<img') ? 'min-width:155px;max-width:155px;' : ''}">${col}</div>`).join('')}</div>`);
			},
		},
		setbadge: {
			permission: 5,
			requireRoom: true,
			async action(message) {
				let [color, shape] = message.trim().split(' ').map(str => toId(str));

				if (!badgeColors[color] || !badges.has(shape)) return this.pmreply("Invalid value for color/shape, check ``.badgeinfo``");

				this.settings.hmset(`badge:${this.room}`, 'shape', shape, 'color', color);
				this.reply(`The badge in ${this.room} is now a ${color} ${shape}.`);
			},
		},
		givebadge: {
			permission: 3,
			requireRoom: true,
			async action(message) {
				message = toId(message);
				if (!message) return this.pmreply("No user supplied");
				profileData.rpush(`badges:${message}`, this.room);
				this.reply(`${message} was given this room's badge.`);
				ChatHandler.send(this.room, `/modnote ${message} was given this room's badge by ${this.username}`);
			},
		},
		badgeinfo: {
			permission: 1,
			async action() {
				let rows = [];
				const shapes = Array.from(badges.keys());
				const colors = Object.keys(badgeColors);

				rows.push('<th><code>.setbadge <color> <shape></code></th>' + shapes.map(shape => `<th><strong>${shape}</strong></th>`).join(''));
				for (const color of colors) {
					rows.push(`<th><strong>${color}</strong></th>` + shapes.map(shape => `<td><img width=18 height=18 src="${server.url}badges/badge.png?shape=${shape}&color=${color}"></td>`).join(''));
				}

				this.replyHTML(`<div style="overflow:auto;"><table class="ladder" style="margin:auto;text-align:center;">${rows.map(row => `<tr>${row}</tr>`).join('')}</table></div>`);
			},
		},
		editcloner: {
			rooms: [WIFI_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(WIFI_ROOM)) return;
				}
				if (!(this.canUse(5) || await this.settings.hexists('whitelist:cloners', this.userid))) return this.pmreply("Permission denied.");

				return this.reply(cloners.addpage.getUrl(WIFI_ROOM, this.username, true, {user: toId(message)}));
			},
		},
	},
};
