const imageSize = require('image-size');
const validUrl = require('valid-url');
const request = require('request');

const COSMO = 'cosmopolitan';

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

const pendingApprovals = new Map();

module.exports = {
	commands: {
		requestapproval: {
			rooms: [COSMO],
			async action(message) {
				let room = this.room;
				let url;
				if (!room) {
					let split = message.split(',');
					[room, url] = split.map(param => param.trim());
					if (!(room && url)) return this.pmreply("Syntax: ``.requestapproval room, url``");
					if (room !== COSMO) return this.pmreply("This room does not support this feature."); // Edit this when/if other rooms want this feature.
					if (!this.getRoomAuth(room)) return;
				} else {
					url = message;
					if (!url) return this.pmreply("Syntax: ``.requestapproval url``");
				}

				if (pendingApprovals.has(room)) return this.reply("There is already someone awaiting approval.");

				if (!/^https?:\/\//.test(url)) url = `http://${url}`;

				if (!validUrl.isWebUri(url)) return this.reply("That's not a valid URL.");

				pendingApprovals.set(room, {user: this.username, url: url});
				Connection.send(`${room}|/modnote ${this.username} wishes to get approval to post '${url}' in the room. Type .approve or .reject to handle the request.`);
			},
		},
		approve: {
			hidden: true,
			disallowPM: true,
			rooms: [COSMO],
			permission: 2,
			async action() {
				if (!pendingApprovals.has(this.room)) return this.pmreply("There is nothing to approve.");

				let {user, url} = pendingApprovals.get(this.room);
				let [width, height] = await fitImage(url).catch(() => this.reply("Something went wrong getting dimensions of the image."));

				if (!(width && height)) return;

				pendingApprovals.delete(this.room);
				return this.reply(`/addhtmlbox <a href="${url}"><img src="${url}" width="${width}" height="${height}"/></a><br/><small>(Image suggested by ${user} and approved by ${this.username})</small>`);
			},
		},
		reject: {
			hidden: true,
			disallowPM: true,
			rooms: [COSMO],
			permission: 2,
			async action() {
				if (!pendingApprovals.has(this.room)) return this.pmreply("There is nothing to disapprove.");

				let {user} = pendingApprovals.get(this.room);	
				pendingApprovals.delete(this.room);

				return this.reply(`/modnote ${this.username} rejected ${user}'s image.`);
			},
		},
	},
};