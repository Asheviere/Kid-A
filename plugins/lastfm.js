var request = require('request');

var API_ROOT = 'http://ws.audioscrobbler.com/2.0/';

module.exports = {
    commands: {
        lastfm: function(symbol, room, message) {
            if (!canUse(symbol, 1)) return {pmreply: "Permission denied."};

            if (!Config.lastfmKey) return errorMsg("No last.fm API key found.");

            var url = API_ROOT + '?method=user.getrecenttracks&user=' + message + '&limit=1&api_key=' + Config.lastfmKey + '&format=json';
            var req = new Promise(function(resolve, reject) {
                request(url, function (error, response, body) {
                    if (error) {
                        errorMsg(error);
                        reject(error);
                    } else {
                        resolve(JSON.parse(body));
                    }
                });
            });

            return req.then(data => {
                var msg = '';
                if (data.recenttracks && data.recenttracks.track && data.recenttracks.track.length) {
                    msg += message;
                    var track = data.recenttracks.track[0];
                    if (track['@attr'] && track['@attr'].nowplaying) {
                        msg += " is now listening to: ";
                    } else {
                        msg += " was last seen listening to: ";
                    }
                    // Should always be the case but just in case.
                    if (track.artist && track.artist['#text']) {
                        msg += track.artist['#text'] + ' - ';
                    }
                    msg += track.name + '. Profile link: http://www.last.fm/user/' + message;
                } else if (data.error) {
                    msg += data.message + '.';
                } else {
                    msg += message + ' doesn\'t seem to have listened to anything recently.';
                }
                return {reply: msg};
            }, data => {pmreply: "Something went wrong! Please try again, or contact the bot's administator(s) when this problem persists."});
        }
    },
};
