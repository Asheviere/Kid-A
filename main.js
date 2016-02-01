require('sugar');

var time = new Date();

global.toId = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
global.consoleMsg = msg => console.log("[" + time.getHours() + ":" + time.getMinutes() + "] " + msg);

global.Config = require('./config.js');
global.Handler = require('./handler.js');
global.Connection = null;
require('./connect.js');
require('./server.js');
