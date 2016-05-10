function loadQuotes() {
	var data;
	try {
		data = require('../data/quotes.json');
	} catch (e) {}

	if (!Object.isObject(data)) data = {};

	return data;
}

function writeQuotes() {
	var toWrite = JSON.stringify(Data.quotes);

	fs.writeFileSync('../data/quotes.json', toWrite);
}

Databases.addDatabase('quotes', loadQuotes, writeQuotes);

module.exports = {
    commands: {
        quote: function (symbol, room, message) {
            if (!room) return {pmreply: "This command can't be used in PMs."};
            if (!canUse(symbol, 2)) return {pmreply: "Permission denied."};
            if (!message.length) return {pmreply: "Please enter a valid quote."};

            if (!Data.quotes[room]) Data.quotes[room] = [];

            if (Data.quotes[room].indexOf(message) > -1) {
                return {pmreply: "Quote is already added."};
            } else {
                Data.quotes[room].push(message);
                return {pmreply: "Quote has been added."};
            }

            Databases.writeDatabase('quotes');
        },
        quotes: function (symbol, room, message) {
            if (!room) return {pmreply: "This command can't be used in PMs."};
            if (!canUse(symbol, 1)) return {pmreply: "Permission denied."};

            if (Data.quotes[room]) {
                return {reply: "http://" + Config.serverhost + ":" + Config.serverport + "/" + room + "/quotes"};
            } else {
                return {pmreply: "This room has no quotes."};
            }
        },
    },
};
