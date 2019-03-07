const Page = require('../page.js');
const redis = require('../redis.js');

const profileData = redis.useDatabase('profiles');
const lastfmData = redis.useDatabase('lastfm');

const AVATAR_URL = `https://play.pokemonshowdown.com/sprites/trainers/`;
const CUSTOM_AVATAR_URL = `https://play.pokemonshowdown.com/sprites/trainers-custom/`;

const fields = {
	discord: ["Discord Username", username => /.{2,32}#[0-9]{4}/.test(username)],
	steam: ["Steam", url => /https?:\/\/steamcommunity.com\/(id|profiles)\/[a-zA-Z0-9]+\/?/.test(url), url => `<a href="${url}">${url}</a>`, null, "Steam Profile URL"],
	smogon: ["Smogon Profile", username => /[a-z0-9]+\.[0-9]{1,7}/.test(username), username => {
		const [name] = username.split('.');
		return `<a href="https://www.smogon.com/forums/members/${username}">${name}</a>`;
	}, "Smogon Account (username.numbers, as shown in your profile URL)"],
	youtube: ["Youtube channel:", url => /https?:\/\/(www\.)?youtube\.com\/(c|channel|user)\/[a-zA-Z0-9-_]+/.test(url), url => `<a href="${url}">${url}</a>`],
	twitch: ["Twitch.tv Username", username => /[a-zA-Z0-9_-]+/.test(username) && username.length < 25, username => `<a href="https://twitch.tv/${username}">${username}</a>`],
	gamertag: ["Gamertag", username => /[a-zA-Z0-9_]+/.test(username) && username.length < 16, null, "Xbox Gamertag"],
	psn: ["PSN", username => /[a-zA-Z0-9_]+/.test(username) && username.length < 25, null, "PlayStation Network Username"],
	switchfc: ["Switch Friendcode", fc => /SW-[0-9]{4}-[0-9]{4}-[0-9]{4}/.test(fc)],
	github: ["Github", username => username, username => `<a href="https://github.com/${username}">${Utils.sanitize(username)}</a>`, "Github Username"],
};

const editpage = new Page('editprofile', contextGenerator, 'editprofile.html', {token: 'profile', rooms: ['global'], postHandler: postHandler, postDataType: 'js'});

async function postHandler(data, room, tokenData) {
	const queryArgs = [];

	for (let field in data) {
		if (field in fields) {
			if (fields[field][1](data[field])) {
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
		await profileData.hmset.call(profileData, queryArgs);
	}
}

async function contextGenerator(room, query, tokenData) {
	let info = await profileData.hgetall(tokenData.user);
	let lastfm = await lastfmData.get(tokenData.user);

	const data = {lastfm: {
		label: "Last.fm Username",
		value: lastfm,
	}};
	for (let field in fields) {
		data[field] = {label: fields[field][3] || fields[field][0], value: info[field] || ''};
	}

	return {user: tokenData.user, fields: data};
}

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
				await profileData.delete(message);
				return this.reply("Profile deleted.");
			},
		},
		profile: {
			permission: 1,
			async action(message) {
				const key = toId(message) || this.userid;
				const profile = await profileData.hgetall(key);
				if (!profile) return this.pmreply("User not found.");

				let output = [];

				const lastfm = await lastfmData.get(key);
				if (lastfm) output.push(`<b>Last.fm:</b> <a href="https://last.fm/user/${encodeURIComponent(lastfm)}">${Utils.sanitize(lastfm)}</a>`);

				const fcs = redis.useDatabase('friendcodes');
				const fc = await fcs.get(key);
				if (fc) output.push(`<b>3DS Friendcode:</b> ${fc.split(':').join(', ')}`);

				for (let field in fields) {
					if (profile[field]) {
						output.push(`<b>${fields[field][0]}:</b> ${fields[field][2] ? fields[field][2](profile[field]) : Utils.sanitize(profile[field])}`);
					}
				}

				const cols = [];

				if (profile.avatar) {
					const avatarUrl = profile.avatar.startsWith('#') ? `${CUSTOM_AVATAR_URL}${profile.avatar.slice(1)}.png` : `${AVATAR_URL}${profile.avatar}.png`;
					cols.push(`<img src="${avatarUrl}" width=80 height=80 style="margin:5px;">`);
				}

				for (let i = 0; i < output.length; i += 5) {
					cols.push(output.slice(i, i + 5).join('<br/>'));
				}

				return this.replyHTML(`<div style="width:100%;overflow-x:auto;"><table><tr>${cols.map(col => `<td style="margin-left:5px;">${col}</td>`).join('')}</tr></table></div>`);
			},
		},
	},
};
