'use strict';

const fs = require('fs');
const handlebars = require('handlebars');

const server = require('./server.js');

// Add extra helpers to handlebars.
handlebars.registerHelper('if_eq', function(val1, val2, options) {
	if (val1 === val2) {
		return options.fn(this);
	}
	return options.inverse(this);
});

handlebars.registerHelper('if_id', function(val1, val2, options) {
	if (toId(val1) === toId(val2)) {
		return options.fn(this);
	}
	return options.inverse(this);
});

handlebars.registerHelper('mod', function(variable, num, eq, options) {
	if (variable % num === eq) {
		return options.fn(this);
	}
	return options.inverse(this);
});

handlebars.registerHelper('parse_date', function(date) {
	if (parseInt(date)) {
		date = new Date(parseInt(date));
		return date.toDateString();
	}
	return date;
});

handlebars.registerHelper('toId', function(str) {
	return toId(str);
});

handlebars.registerHelper('parse_duration', function(time) {
	let number = Date.now() - time;
	const date = new Date(+number);
	const parts = [date.getUTCFullYear() - 1970, date.getUTCMonth(), date.getUTCDate() - 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
	const unitNames = ["second", "minute", "hour", "day", "month", "year"];
	const positiveIndex = parts.findIndex(elem => elem > 0);
	return parts.slice(positiveIndex).reverse().map((value, index) => value ? value + " " + unitNames[index] + (value > 1 ? "s" : "") : "").reverse().join(" ").trim();
});

let header;
try {
	header = fs.readFileSync('./templates/header.html', "utf8");
} catch (e) {
	errorMsg(`Could not load header template.`);
}
handlebars.registerPartial('header', header);

class Page {
	constructor(filename, contextGenerator, template, options = {}) {
		this.filename = filename;
		this.rooms = options.rooms || [];
		this.context = contextGenerator;

		try {
			let data = fs.readFileSync(`./templates/${template}`, "utf8");
			this.template = handlebars.compile(data);
		} catch (e) {
			errorMsg(`Could not load template '${template}'.`);
		}

		this.token = options.token;
		this.optionalToken = options.optionalToken;
		this.postHandler = options.postHandler;
		this.postDataType = options.postDataType || 'JSON';

		for (let room of this.rooms) {
			server.addRoute(`/${room}/${this.filename}`, (req, res) => this.resolve(req, res));
		}
		server.restart();
	}

	addRoom(room) {
		this.rooms.push(room);
		server.addRoute(`/${room}/${this.filename}`, (req, res) => this.resolve(req, res));
	}

	parseURL(url) {
		let split = url.split('?');
		if (split.length === 1) return {};
		let query = split[1];
		let parts = query.split('&');
		let output = {};
		for (let i = 0; i < parts.length; i++) {
			let elem = parts[i].split('=');
			if (elem.length === 2) {
				output[elem[0]] = elem[1];
			}
		}
		return output;
	}

	async resolve(req, res) {
		let room = req.originalUrl.split('/')[1];
		let query = this.parseURL(req.url);
		let token = query.token;
		let tokenData;

		if (this.token) {
			if (!token && !this.optionalToken) return res.end('Please attach an access token. (You should get one when you type the command in PM)');
			tokenData = server.getAccessToken(token);

			if (token) {
				if (!tokenData || !(this.token in tokenData) || room !== tokenData.room) return res.end('Invalid access token.');

				if (req.method === "POST" && this.postHandler) {
					if (!tokenData[this.token]) return res.end("Permission denied.");
					if (!(req.body && req.body.data)) return res.end("Malformed request.");
					let data;
					if (this.postDataType === 'JSON') {
						try {
							data = JSON.parse(decodeURIComponent(req.body.data));
						} catch (e) {
							return res.end("Malformed JSON.");
						}
					} else {
						data = req.body.data;
					}
					await this.postHandler(data, room, tokenData, query);
				}
			}
		}

		let content = await this.context(room, query, tokenData);
		if (typeof content === 'string') return res.end(content);
		return res.end(this.template(content));
	}

	getUrl(room, userid, permission = true, options = {}, noToken = false, tokenData = {}) {
		if (!this.rooms.includes(room)) return false;
		let fname = `${room}/${this.filename}`;

		if (this.token && !noToken) {
			tokenData.room = room;
			tokenData.user = userid;
			tokenData[this.token] = permission;
			options.token = server.createAccessToken(tokenData, 60);
		}

		let optionString = Object.keys(options).map(opt => `${toId(opt)}=${toId(options[opt])}`).join('&');
		if (optionString) fname += `?${optionString}`;
		return `${server.url}${fname}`;
	}
}

module.exports = Page;
