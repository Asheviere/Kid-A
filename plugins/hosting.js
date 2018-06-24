const request = require('request');
const fs = require('fs');
const probe = require('probe-image-size');

const server = require('../server.js');

async function uploadImage(url, room, fname) {
	await probe(url); // To check whether the url is actually an image

	const extension = url.split('.')[url.split('.').length - 1];

	const mkdir = new Promise((resolve) => {
		fs.mkdir(`../public/${room}/`, () => {
			resolve();
		});
	});

	await mkdir;

	const req = new Promise(resolve => {
		request(url).pipe(fs.createWriteStream(`./public/${room}/${fname}.${extension}`)).on('close', resolve);
	});

	await req;

	return `${room}/${fname}.${extension}`;
}

module.exports = {
	commands: {
		upload: {
			async action(message) {
				let [room, fname, url] = message.split(',').map(param => param.trim());
				room = toId(room);
				fname = encodeURIComponent(fname).toLowerCase();
				if (!(room && fname && url)) return this.reply("Syntax: ``.upload roomid, filename, url``");
				if (!this.getRoomAuth(room)) return;
				if (!this.canUse(5)) return this.pmreply("Permission denied.");

				uploadImage(url, room, fname).then((path) => {
					this.reply(`Image successfully uploaded as ${server.url}${path}`);
				}, () => {
					this.reply("Something went wrong uploading the file.");
				});
			},
		},
	},
};