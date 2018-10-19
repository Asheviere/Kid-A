const fs = require('fs');

const md = require('markdown').markdown;

const Page = require('../page.js');

const BASE_PAGE_PATH = './data/pages-';

const cache = new Map();

function getPage(roomid, pageid) {
	return new Promise((resolve, reject) => {
		if (cache.has(roomid)) return resolve(cache.get(roomid)[pageid]);

		fs.access(`${BASE_PAGE_PATH}${roomid}.json`, err => {
			if (err) {
				if (err.code === 'ENOENT') return resolve(undefined);
				Debug.log(2, `Failed to access page data file: ${roomid}/${pageid}${err}`);
				reject(err);
			}

			const json = require(`.${BASE_PAGE_PATH}${roomid}.json`);

			cache.set(roomid, json);
			resolve(cache.get(roomid)[pageid]);
		});
	});
}

async function setPage(roomid, pageid, title, content) {
	if (!cache.has(roomid)) await getPage(roomid, pageid);

	if (!cache.has(roomid)) cache.set(roomid, {});
	cache.get(roomid)[pageid] = {title: title, content: content};
	fs.writeFile(`${BASE_PAGE_PATH}${roomid}.json`, JSON.stringify(cache.get(roomid)), () => {});
}

const page = new Page('pages/', async (room, query, tokenData, url) => {
	const pageData = await getPage(room, url.slice(1));
	if (!pageData) return '404 Page not found';
	return {title: pageData.title, content: md.toHTML(pageData.content)};
}, 'template.html', {});

const editPage = new Page('editpage', async (room, query) => {
	const pageData = await getPage(room, query.page);
	if (!pageData) return {id: query.page, title: query.page, content: ''};
	return {id: query.page, title: pageData.title, content: pageData.content.split('\n').slice(0, -1).join('\n')};
}, 'editpage.html', {token: 'editpage', postDataType: 'js', postHandler: async (data, room, tokenData, query) => {
	const today = new Date();
	await setPage(room, query.page, data.title, data.content + `\n###### Last edited by: ${tokenData.user} on ${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`);
	ChatHandler.send(room, `/modnote ${tokenData.user} has updated ${query.page}.html`);
}});

module.exports = {
	async init() {
		let rooms = await ChatLogger.getRooms();

		for (let i = 0; i < rooms.length; i++) {
			page.addRoom(rooms[i]);
			editPage.addRoom(rooms[i]);
		}
	},
	commands: {
		editpage: {
			requireRoom: true,
			permission: 4,
			async action(message) {
				const pageid = toId(message);
				if (!pageid) return this.reply("Invalid page name.");
				this.reply(editPage.getUrl(this.room, this.userid, true, {page: pageid}));
			},
		},
	},
};
