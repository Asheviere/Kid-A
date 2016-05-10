var fs = require('fs');

function loadUserlist() {
    var userlist;
    try {
        userlist = require('../data/userlist.json');
    } catch (e) {}

    if (!Object.isObject(userlist)) userlist = {};

    return userlist;
}

function writeUserlist() {
    var toWrite = JSON.stringify(Data.userlist);

	fs.writeFileSync('../data/userlist.json', toWrite);
}

Databases.addDatabase('userlist', loadUserlist, writeUserlist);

module.exports = {
    commands: {
        addinfo: function(symbol, room, message) {
            if (!canUse(symbol, 2)) return {pmreply: "Permission denied."};
            if (!room) return {pmreply: "This command cannot be used in PM."};
            var params = message.split(',').map(param => param.trim());

            if (!params.length) return {pmreply: "No user supplied."};

            var userid = toId(params[0]);
            var info = {};

            for (var i = 1; i < params.length; i++) {
                var vals = params[i].split(':').map(param => param.trim());
                if (vals.length < 2) return {pmreply: "Syntax error."};

                info[toId(vals[0])] = vals[1];
            }

            if (!Data.userlist[room]) Data.userlist[room] = {};
            Data.userlist[room][userid] = info;
            Databases.writeDatabase('userlist');
            return {reply: "Info successfully added."};
        },
        removeinfo: function(symbol, room, message) {
            if (!canUse(symbol, 2)) return {pmreply: "Permission denied."};
            if (!room) return {pmreply: "This command cannot be used in PM."};
            var params = message.split(',').map(param => param.trim());

            if (!params.length) return {pmreply: "No user supplied."};

            var userid = toId(params[0]);

            if (!(Data.userlist[room] && Data.userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

            if (params.length === 1) {
                delete Data.userlist[room][userid];
                Databases.writeDatabase('userlist');
                return {reply: "User successfully deleted."};
            }

            for (var i = 1; i < params.length; i++) {
                var val = toId(params[i]);
                if (!(val in Data.userlist[room][userid])) return {pmreply: "Field not found: " + val};

                delete Data.userlist[room][userid][val];
            }

            Databases.writeDatabase('userlist');
            return {reply: "Info successfully deleted."};
        },
        info: function(symbol, room, message) {
            if (!room) return {pmreply: "This command cannot be used in PM."};
            var params = message.split(',').map(param => param.trim());

            if (!params.length) return {pmreply: "No user supplied."};

            var userid = toId(params[0]);

            if (!(Data.userlist[room] && Data.userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

            if (params.length === 1) {
                var output = [];
                for (var i in Data.userlist[room][userid]) {
                    output.push(i + ": " + Data.userlist[room][userid][i]);
                }
                return {reply: output.join(', ')};
            }

            var field = toId(params[1]);
            if (!(field in Data.userlist[room][userid])) return {pmreply: "Field not found."};

            writeData();
            return {reply: field + ": " + Data.userlist[room][userid][field]};
        },
    },
};
