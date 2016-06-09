exports.host = 'sim.smogon.com';
exports.port = '8000';

// Host and port to use for the http server part of Kid A.
exports.serverhost = 'localhost';
exports.serverport = '8000';

// Username and password to use on PS.
exports.username = '';
exports.password = '';

// Rooms to join and avatar to choose. The maximum amount of rooms Kid A can join upon connecting is 11.
// The reason for these restrictions is the way PS protocol works. I might try to get around it at a later date, but this is it for now.
exports.rooms = ['dev'];
exports.avatar = '246';

// Symbol to use for commands.
exports.commandSymbol = '.';

// Names of  the administrators of the bot.
exports.admins = ['bumbadadabum'];

// Blacklisted plugins. Accepts filenames, minus .js.
exports.blacklistedPlugins = [];

// Whether the bot can (and should) check IPs instead of usernames for room moderation.
exports.checkIps = 'true';

// Last.fm API key, used for the lastfm feature.
exports.lastfmKey = '';
