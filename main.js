require('sugar');

global.toId = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');

global.Config = require('./config.js');
global.Handler = require('./handler.js');
global.Connection = null;
require('./connect.js');
require('./server.js');
