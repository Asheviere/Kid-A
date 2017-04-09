'use strict';

const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const connect = require('connect');
const serveStatic = require('serve-static');
const handlebars = require('handlebars');
const bodyParser = require('body-parser');

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

class Server {
	constructor(host, port) {
		statusMsg('Setting up server.');

		let protocol = (port === 443) ? 'https' : 'http';
		this.protocol = protocol;
		this.host = host;
		this.port = port;
		this.url = protocol + '://' + host + (protocol === 'http' && port !== 80 ? ':' + port : '') + '/';

		this.index = path.resolve(__dirname, './public');

		this.isRestarting = false;
		this.restartPending = false;

		this.accessTokens = new Map();

		this.templates = {};

		this.pages = new Map();

		this.init();

		statusMsg('Server started successfully.');
	}

	// Returns either the HTTP or the HTTPS module depending on whether or not
	// the server is hosted using SSL.
	get nativeProtocolModule() {
		return require(this.protocol);
	}

	// Bootstraps the HTTP/HTTPS server.
	init() {
		// Init the server
		this.site = connect();

		this.addMiddleware(bodyParser.urlencoded({extended: false, type: 'application/x-www-form-urlencoded'}));

		this.site.use(serveStatic(this.index));
		this._server = null;

		// Load all saved pages.
		this.pages.forEach((value, key) => this.site.use(key, value));

		// Add the middleware for redirecting any unknown requests to a 404
		// error page here, so it can always be the last one added.
		this.site.use((req, res) => {
			let {path} = url.parse(req.url);
			let buffer = '<h1>404 Not Found</h1>';
			if (path.endsWith('/data')) {
				let room = path.slice(1, -5);
				buffer += '<p>Data for the room "' + room + '" could not be found.</p>';
			} else if (path.endsWith('/quotes')) {
				let room = path.slice(1, -7);
				buffer += '<p>Quotes for the room "' + room + '" could not be found.</p>';
			}
			res.end(buffer);
		});

		this._server = this.nativeProtocolModule.createServer(this.site);
		this._server.listen(this.port);
	}

	// Configures the routing for the given path using the given function,
	// which dynamically generates the HTML to display on that path.
	addRoute(path, resolver) {
		this.pages.set(path, resolver);
		this.site.use(path, resolver);
	}

	removeRoute(path) {
		this.pages.delete(path);
	}

	// Adds other sorts of middleware to the router.
	addMiddleware(middleware) {
		this.site.use(middleware);
	}

	// Restarts the server.
	restart() {
		if (this.isRestarting) {
			this.restartPending = true;
			return false;
		}
		if (!this._server) return false;

		this.isRestarting = true;
		this._server.close(() => {
			this.init();
			this.isRestarting = false;
			if (this.restartPending) {
				this.restartPending = false;
				this.restart();
			}
		});
	}

	createAccessToken(data, mins) {
		let token = crypto.randomBytes(5).toString('hex');
		data.expiration = mins * 1000 * 60;
		data.timeout = setTimeout(() => this.removeAccessToken(token), data.expiration);
		this.accessTokens.set(token, data);
		return token;
	}

	getAccessToken(token) {
		let data = this.accessTokens.get(token);
		if (data) {
			clearTimeout(data.timeout);
			setTimeout(() => this.removeAccessToken(token), data.expiration);
			return data;
		}
		return false;
	}

	removeAccessToken(token) {
		let data = this.accessTokens.get(token);
		if (data) {
			clearTimeout(data.timeout);
			return this.accessTokens.delete(token);
		}
		return false;
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

	addTemplate(id, file) {
		let data = '';
		try {
			data = fs.readFileSync('./templates/' + file, "utf8");
		} catch (e) {
			errorMsg(`Could not load template file ${file}.`);
		}
		this.templates[id] = handlebars.compile(data);
	}

	renderTemplate(id, data) {
		return this.templates[id](data);
	}
}

module.exports = new Server(Config.serverhost, Config.serverport);
