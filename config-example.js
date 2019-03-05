exports.host = 'sim.smogon.com';
exports.port = 8000;

// Host and port to use for the http server part of Kid A.
exports.serverhost = 'localhost';
exports.serverport = 8000;

// Enter a value (or load a file) for these if you want to use https and SSL.
exports.sslCert = '';
exports.sslKey = '';
exports.sslCa = '';

// Username and password to use on PS.
exports.username = '';
exports.password = '';

// Rooms to hardcoded join and avatar to choose. The bot can be /invited to other rooms, except for blacklisted rooms.
exports.rooms = ['dev'];
exports.blacklistedRooms = [];
exports.avatar = 246;

// Symbol to use for commands.
exports.commandSymbol = '.';

// Names of  the administrators of the bot.
exports.admins = new Set();

// Blacklisted plugins. Accepts filenames.
exports.blacklistedPlugins = new Set();

// Rooms that shouldn't show up in on public pages.
exports.privateRooms = new Set();

// Last.fm API key, used for the lastfm feature.
exports.lastfmKey = '';

// Youtube API key, used for the lastfm feature.
exports.youtubeKey = '';

// Mashape API key, used for the hs feature.
exports.mashapeKey = '';

// API keys used for api.js
exports.igdbKey = '';

// Logging related options.
exports.disableLogging = false;
exports.logMessages = true;
