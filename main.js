require('sugar');

let timeElem = string => (string < 10 ? "0" : "") + string;

global.toId = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');

global.consoleMsg = msg => {
    var time = new Date();
    console.log("[" + timeElem(time.getHours()) + ":" + timeElem(time.getMinutes()) + "] " + msg);
};

// Maybe also something more elaborate for this one
global.logMsg = msg => {
    var time = new Date();
    console.log("[" + timeElem(time.getDate()) + "/" + timeElem(time.getMonth() + 1) + " " + timeElem(time.getHours()) + ":" + timeElem(time.getMinutes()) + "] " + msg);
}

// For now these are pretty basic, but this might get fancier if/when I implement colors and other markup.

global.statusMsg = msg => console.log("[STATUS] " + msg);

global.errorMsg = msg => console.log("[ERROR] " + msg);

global.pmMsg = msg => consoleMsg(msg);

global.forceQuit = msg => {
    console.log("[FATAL] " + msg);

    var time = new Date();

    console.log("Kid A forcequit " + (time.getHours() < 10 ? "0" : "") + time.getHours() + ":" + (time.getMinutes() < 10 ? "0" : "") + time.getMinutes() + ".");
    process.exit(-1);
};

global.Config = require('./config.js');
global.Handler = require('./handler.js');
global.Connection = null;
require('./connect.js');
require('./server.js');
