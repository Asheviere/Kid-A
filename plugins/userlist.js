var fs = require('fs');

var userlist;
try {
    userlist = JSON.parse(fs.readFileSync('./data/userlist.json'));
} catch (e) {}

if (!Object.isObject(userlist)) userlist = {};

var writePending;
var writing;

function writeData() {
    if (writePending) return false;

    if (writing) {
        writePending = true;
        return;
    }
    writing = true;
    var toWrite = JSON.stringify(userlist);

    fs.writeFile('./data/userlist.json', toWrite, () => {
        writing = false;
        if (writePending) {
            writePending = false;
            writeData();
        }
    });
};

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

            if (!userlist[room]) userlist[room] = {};
            userlist[room][userid] = info;
            writeData();
            return {reply: "Info successfully added."};
        },
        removeinfo: function(symbol, room, message) {
            if (!canUse(symbol, 2)) return {pmreply: "Permission denied."};
            if (!room) return {pmreply: "This command cannot be used in PM."};
            var params = message.split(',').map(param => param.trim());

            if (!params.length) return {pmreply: "No user supplied."};

            var userid = toId(params[0]);

            if (!(userlist[room] && userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

            if (params.length === 1) {
                delete userlist[room][userid];
                writeData();
                return {reply: "User successfully deleted."};
            }

            for (var i = 1; i < params.length; i++) {
                var val = toId(params[i]);
                if (!(val in userlist[room][userid])) return {pmreply: "Field not found: " + val};

                delete userlist[room][userid][val];
            }

            writeData();
            return {reply: "Info successfully deleted."};
        },
        info: function(symbol, room, message) {
            if (!room) return {pmreply: "This command cannot be used in PM."};
            var params = message.split(',').map(param => param.trim());

            if (!params.length) return {pmreply: "No user supplied."};

            var userid = toId(params[0]);

            if (!(userlist[room] && userlist[room][userid])) return {pmreply: "User not found in this room's userlist."};

            if (params.length === 1) {
                var output = [];
                for (var i in userlist[room][userid]) {
                    output.push(i + ": " + userlist[room][userid][i]);
                }
                return {reply: output.join(', ')};
            }

            var field = toId(params[1]);
            if (!(field in userlist[room][userid])) return {pmreply: "Field not found."};

            writeData();
            return {reply: field + ": " + userlist[room][userid][field]};
        },
    },
};
