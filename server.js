var http = require('http');
var connect = require('connect');
var serveStatic = require('serve-static');

statusMsg('Setting up server.');

var site = connect();
var httpserver;

var Server = module.exports;

function add404() {
	for (var i = 0; i < site.stack.length; i++) {
		if (site.stack[i].route === '') {
			site.stack.splice(i, 1);
			break;
		}
	}

	site.use((req, res) => res.end('Invalid room.'));
}

Server.addPage = function(name, resolver) {
	site.use(name, resolver);
};

var restarting = false;
var restartPending = false;

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

site.use(serveStatic(__dirname + '/public'));

statusMsg('Server started successfully.');
