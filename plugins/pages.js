const fs = require('fs');

const md = require('markdown').markdown;

const Page = require('../page.js');

const BASE_PAGE_PATH = './data/pages-';
const INTERVAL = 3 * 60 * 60 * 1000;

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
	if (!content) {
		delete cache.get(roomid)[pageid];
		return;
	}
	cache.get(roomid)[pageid] = {title: title, content: content};
	fs.writeFile(`${BASE_PAGE_PATH}${roomid}.json`, JSON.stringify(cache.get(roomid)), () => {});
}

const blockElements = ['ul', 'ol', 'p'];

function parseContent(rawContent) {
	let parsedContent = '';
	for (let i = 0; i < rawContent.length; i++) {
		if (rawContent[i] === '\n') {
			let hasBlockElement = false;
			for (const element of blockElements) {
				const elemLength = element.length + 2;
				hasBlockElement = hasBlockElement || (rawContent.substr(i - elemLength - 1, elemLength + 1) === `</${element}>` || rawContent.substr(i + 1, elemLength) === `<${element}>`);
			}
			if (!hasBlockElement) {
				parsedContent += '<br/>';
				continue;
			}
		}
		parsedContent += rawContent[i];
	}
	return parsedContent;
}

const page = new Page('pages/', async (room, query, tokenData, url) => {
	const pageData = await getPage(room, url.slice(1));
	if (!pageData) return '404 Page not found';
	let rawContent = md.toHTML(pageData.content);
	let parsedContent = parseContent(rawContent);
	return {title: pageData.title, content: parsedContent};
}, 'template.html', {});

const editPage = new Page('editpage', async (room, query) => {
	const pageData = await getPage(room, query.page);
	if (!pageData) return {id: query.page, title: query.page, content: ''};
	return {id: query.page, title: pageData.title, content: pageData.content.split('\n').slice(0, -1).join('\n')};
}, 'editpage.html', {token: 'editpage', postDataType: 'js', postHandler: async (data, room, tokenData, query) => {
	const today = new Date();
	await setPage(room, query.page, data.title, data.content + `\n###### Last edited by: ${tokenData.user} on ${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`);
	ChatHandler.send(room, `/modnote ${tokenData.user} has updated the page '${query.page}'.`);
	if (query.page === 'noticeboard') sendNoticeboard(room);
}});

const noticeboardTimers = new Map();

async function sendNoticeboard(room) {
	if (noticeboardTimers.has(room)) clearTimeout(noticeboardTimers.get(room));
	const pageData = await getPage(room, 'noticeboard');
	if (!pageData) return;
	let rawContent = md.toHTML(pageData.content.split('\n').slice(0, -1).join(''));
	let parsedContent = parseContent(rawContent);
	let noticeboard = `<div class='infobox'><div style="text-align:center;"><h3>Noticeboard:</h3>${parsedContent.replace(/\n/g, '')}</div></div>`;
	console.log(room, noticeboard);
	ChatHandler.send(room, `/adduhtml noticeboard, ${noticeboard}`);
	noticeboardTimers.set(room, setInterval(() => {
		sendNoticeboard(room);
	}, INTERVAL));
}

module.exports = {
	async init() {
		let rooms = await ChatLogger.getRooms();

		for (let i = 0; i < rooms.length; i++) {
			page.addRoom(rooms[i]);
			editPage.addRoom(rooms[i]);
		}
	},
	async onJoinRoom(room) {
		sendNoticeboard(room);
	},
	commands: {
		editpage: {
			requireRoom: true,
			permission: 4,
			async action(message) {
				const pageid = toId(message);
				if (!pageid) return this.reply("Invalid page name.");
				this.pmreply(editPage.getUrl(this.room, this.userid, true, {page: pageid}));
			},
		},
		deletepage: {
			requireRoom: true,
			permission: 4,
			async action(message) {
				const pageid = toId(message);
				if (!pageid) return this.reply("Invalid page name.");
				await setPage(this.room, pageid);
				ChatHandler.send(this.room, `/modnote ${this.username} has deleted the page '${pageid}'`);
				this.reply("Page deleted.");
			},
		},
	},
};
