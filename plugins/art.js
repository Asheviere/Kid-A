const fs = require('fs');

const Page = require('../page.js');
const Cache = require('../cache.js');

const ART_ROOM = 'art';
const ROOMINTROS_FILE = 'intros.json';
const cache = new Cache('roomintros');

let intros = {};
try {
	intros = require(`../data/${ROOMINTROS_FILE}`);
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND' && e.code !== 'ENOENT') throw e;
}
if (!intros || typeof intros !== 'object') intros = {};

function renderEditor() {
	return new Promise(resolve => {
		fs.readFile(`./data/art_roomintro.html`, (err, data) => {
			let content = '';
			if (err) {
				if (err.code !== 'ENOENT') {
					resolve("Something went wrong loading the file.");
				}
			} else {
				content = String(data);
			}
			resolve({name: "Roomintro", content: content});
		});
	});
}

function saveEdits(data, room, tokenData) {
	fs.writeFile(`./data/art_roomintro.html`, data, err => {
		if (err) return Connection.send(`|/pm ${tokenData.user}, Something went wrong saving the file.`);
		Connection.send(`${ART_ROOM}|/modnote ${tokenData.user} updated the roomintro`);
	});
}

const introEditor = new Page('editroomintro', renderEditor, 'editdoc.html', {token: 'roomintro', postHandler: saveEdits, postDataType: 'txt', rooms: [ART_ROOM]});

function renderRoomintro(banner, note, flavor) {
	return new Promise((resolve, reject) => {
		fs.readFile(`./data/art_roomintro.html`, (err, data) => {
			let content = '';
			if (err) {
				if (err.code !== 'ENOENT') {
					return reject("Something went wrong loading the file.");
				}
			} else {
				content = String(data);
			}
			content = content.replace('{{BANNER}}', banner).replace('{{NOTE}}', note).replace('{{FLAVOR}}', flavor);
			resolve(content);
		});
	});
}

module.exports = {
	commands: {
		nextbanner: {
			rooms: [ART_ROOM],
			async action() {
				if (!this.room) {
					if (!this.getRoomAuth(ART_ROOM)) return;
				}

				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				let repeats = cache.get('repeats');
				if (!Array.isArray(repeats)) repeats = [];
				let options = Object.keys(intros).filter(val => !repeats.includes(val));
				if (!options) return this.pmreply("No suitable banner found");

				let next = options[Math.floor(Math.random() * options.length)];
				repeats.push(next);
				if (repeats.length > 0.75 * Object.keys(intros).length) repeats.shift();
				cache.set('repeats', repeats);
				cache.write();

				let {banner, note, flavor} = intros[next];
				let intro = await renderRoomintro(banner, note, flavor).catch(err => this.reply(err));
				if (intro) Connection.send(`${ART_ROOM}|/roomintro ${intro}`);
			},
		},
		addbanner: {
			rooms: [ART_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(ART_ROOM)) return;
				}

				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				let [banner, note, flavor] = message.split(message.includes('|') ? '|' : ',').map(param => param.trim());

				if (!(banner && note && flavor)) return this.pmreply("Syntax: ``.addroomintro banner | note | flavor text``");

				intros[banner] = {banner: banner, note: note, flavor: flavor};
				fs.writeFile(`./data/${ROOMINTROS_FILE}`, JSON.stringify(intros), () => {});
				Connection.send(`${ART_ROOM}|/modnote ${this.username} added a banner: ${banner}`);
				this.reply("Banner added.");
			},
		},
		deletebanner: {
			rooms: [ART_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(ART_ROOM)) return;
				}

				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				if (!(message in intros)) return this.pmreply("Banner not found");

				delete intros[message];
				fs.writeFile(`./data/${ROOMINTROS_FILE}`, JSON.stringify(intros), () => {});
				Connection.send(`${ART_ROOM}|/modnote ${this.username} deleted a banner: ${message}`);
				this.reply("Banner deleted.");
			},
		},
		editroomintro: {
			rooms: [ART_ROOM],
			async action(message) {
				if (!this.room) {
					if (!this.getRoomAuth(ART_ROOM)) return;
				}

				if (!(this.canUse(5))) return this.pmreply("Permission denied.");

				const url = introEditor.getUrl(ART_ROOM, this.userid, true, {name: toId(message)});
				return this.pmreply(`Edit link: ${url}`);
			},
		},
	},
};
