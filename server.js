'use strict';

const http = require('http');
const connect = require('connect');
const serveStatic = require('serve-static');

statusMsg('Setting up server.');

const site = connect();
let httpserver;

let Server = module.exports;

function add404() {
	site.stack = site.stack.filter((s) => s.route !== '');
	site.use(serveStatic(__dirname + '/public'));
	site.use((req, res) => res.end('Invalid room.'));
}

Server.url = 'http://' + Config.serverhost + (Config.serverport === '80' ? '' : ':8000') + '/';

site.use(serveStatic(__dirname + '/public'));

Server.addPage = function(name, resolver) {
	site.use(name, resolver);
};

let restarting = false;
let restartPending = false;

Server.restart = function() {
	if (restarting) {
		restartPending = true;
		return;
	};
	if (!httpserver) return errorMsg("Trying to restart server but no server found.");

	add404();

	httpserver.close(() => {
		httpserver = http.createServer(site);
		httpserver.listen(Config.serverport);
		restarting = false;
		if (restartPending) {
			restartPending = false;
			Server.restart();
		};
	});
};

Server.start = function() {
	if (httpserver) return Server.restart();

	add404();

	httpserver = http.createServer(site);
	httpserver.listen(Config.serverport);
};

statusMsg('Server started successfully.');
