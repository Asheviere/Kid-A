'use strict';

process.on('uncaughtException', err => console.log(err.stack));
process.on('unhandledRejection', err => console.log(err.stack));

// TODO: abstract logging away from the global namespace.
global.stdout = '';

global.output = string => {
	stdout += string + '\n';
	console.log(string);
};

global.toId = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');

global.sanitize = text => ('' + text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\//g, '&#x2f;');

const timeElem = string => (string < 10 ? '0' : '') + string;

global.consoleMsg = msg => {
	let time = new Date();
	global.output('[' + timeElem(time.getHours()) + ':' + timeElem(time.getMinutes()) + '] ' + msg);
};

// Maybe also something more elaborate for this one
global.logMsg = msg => {
	let time = new Date();
	output('[' + timeElem(time.getDate()) + '/' + timeElem(time.getMonth() + 1) + ' ' + timeElem(time.getHours()) + ':' + timeElem(time.getMinutes()) + '] ' + msg);
};

// For now these are pretty basic, but this might get fancier if/when I implement colors and other markup.

global.statusMsg = msg => output('[STATUS] ' + msg);

global.errorMsg = msg => output('[ERROR] ' + msg);

global.pmMsg = msg => consoleMsg(msg);

global.forceQuit = msg => {
	output('[FATAL] ' + msg);

	let time = new Date();
	output('Kid A forcequit ' + timeElem(time.getHours()) + ':' + timeElem(time.getMinutes()) + '.');
	process.exit(0);
};

global.Config = require('./config.js');
global.ChatLogger = require('./chat-logger.js');
global.Handler = require('./handler.js');

// After bootstrapping our databases, start serving our public data over
// HTTP/HTTPS.
const server = require('./server.js'); // eslint-disable-line no-unused-vars

// Finally, open the connection to the Pokemon Showdown server.
global.Connection = null;
require('./connect.js');
