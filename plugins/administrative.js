module.exports = {
    reload: function(symbol, room, message) {
        if (!canUse(symbol, 5)) return {pmreply: "Permission denied."};

        switch (message) {
            case 'data':
                loadData();
                return {reply: "Data reloaded successfully."};
            case 'config':
                global.Config = require('../config.js');
                return {reply: "Config reloaded successfully."};
            default:
                return {pmreply: "Invalid option."};
        }
    }
};
