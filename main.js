require('sugar');

var timeElem = string => (string < 10 ? "0" : "") + string;

global.stdout = "";

global.output = string => {
    stdout += string + "\n";
    console.log(string);
};

global.canUse = function (symbol, permission) {
    switch (symbol) {
        case '~':
        case '#':
        case '&':
            return (permission < 6);
        case '@':
            return (permission < 5);
        case '%':
            return (permission < 4);
        case '%':
            return (permission < 3);
        case '+':
            return (permission < 2);
        default:
            return !permission;
    }
};

global.toId = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');

global.consoleMsg = msg => {
    var time = new Date();
    output("[" + timeElem(time.getHours()) + ":" + timeElem(time.getMinutes()) + "] " + msg);
};

// Maybe also something more elaborate for this one
global.logMsg = msg => {
    var time = new Date();
    output("[" + timeElem(time.getDate()) + "/" + timeElem(time.getMonth() + 1) + " " + timeElem(time.getHours()) + ":" + timeElem(time.getMinutes()) + "] " + msg);
}

// For now these are pretty basic, but this might get fancier if/when I implement colors and other markup.

global.statusMsg = msg => output("[STATUS] " + msg);

global.errorMsg = msg => output("[ERROR] " + msg);

global.pmMsg = msg => consoleMsg(msg);

global.forceQuit = msg => {
    output("[FATAL] " + msg);

    var time = new Date();

    output("Kid A forcequit " + (time.getHours() < 10 ? "0" : "") + time.getHours() + ":" + (time.getMinutes() < 10 ? "0" : "") + time.getMinutes() + ".");
    process.exit(-1);
};

global.Config = require('./config.js');
global.Databases = require('./databases.js');
global.Handler = require('./handler.js');
global.Connection = null;
require('./connect.js');
require('./server.js');
