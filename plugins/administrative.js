var fs = require('fs');
var crypto = require('crypto');

module.exports = {
    commands: {
        reload: function(symbol, room, message) {
            if (!canUse(symbol, 5)) return {pmreply: "Permission denied."};

            switch (message) {
                case 'data':
                    loadData();
                    return {reply: "Data reloaded successfully."};
                case 'config':
                    delete require.cache[require.resolve('../config.js')];
                    Config = require('../config.js');
                    return {reply: "Config reloaded successfully."};
                default:
                    return {pmreply: "Invalid option."};
            }
        },
        console: function(symbol, room, message) {
            if (!canUse(symbol, 5)) return {pmreply: "Permission denied."};

            var fname = crypto.randomBytes(10).toString('hex');
            var path = './public/' + fname + '.txt';
            fs.writeFileSync(path, stdout);
            setTimeout(() => fs.unlinkSync(path), 10 * 60 * 1000);
            return {pmreply: 'Console output saved as ' + Config.serverhost + ':' + Config.serverport + '/' + fname + '.txt'};
        }
    }
};
