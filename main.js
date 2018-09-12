'use strict';

process.on('uncaughtException', err => Output.errorMsg(err.stack));
process.on('unhandledRejection', err => Output.errorMsg(err.stack));

global.Config = require('./config.js');

// Require auxiliary files
require('./core.js');
require('./utils.js');

/**
 * Log levels:
 *
 * 0: nothing (default)
 * 1: Only debug messages in plugins
 * 2: Also including message parser
 * 3: Also including server and chat handler
 * 4: Also including database
 * 5: Absolutely everything
 */
if (process.argv.length > 2) {
	if (process.argv[2] === 'debug') {
		let logLvl = 2;
		if (process.argv.length > 3) {
			logLvl = parseInt(process.argv[3]) || logLvl;
			if (logLvl > 5) logLvl = 5;
		}
		Output.log('status', `Loading Debug Mode with log level ${logLvl}`);
		Debug.logLvl = logLvl;
	}
}

global.ChatLogger = require('./chat-logger.js');
require('./handler.js');

// After bootstrapping our databases, start serving our public data over
// HTTP/HTTPS.
require('./server.js');

// Finally, open the connection to the Pokemon Showdown server.
global.Connection = null;
require('./connect.js');
