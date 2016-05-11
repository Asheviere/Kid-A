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
        quote: function (userstr, room, message) {
            if (!room) return {pmreply: "This command can't be used in PMs."};
            if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};
            if (!message.length) return {pmreply: "Please enter a valid quote."};

            var quote = sanitize(message);

            if (!Data.quotes[room]) Data.quotes[room] = [];

            if (Data.quotes[room].indexOf(quote) > -1) {
                return {pmreply: "Quote is already added."};
            } else {
                Data.quotes[room].push(quote);
                return {pmreply: "Quote has been added."};
            }

            Databases.writeDatabase('quotes');
        },
        quotes: function (userstr, room, message) {
            if (!room) return {pmreply: "This command can't be used in PMs."};
            if (!canUse(userstr, 2)) return {pmreply: "Permission denied."};

            if (Data.quotes[room]) {
                return {reply: "http://" + Config.serverhost + ":" + Config.serverport + "/" + room + "/quotes"};
            } else {
                return {pmreply: "This room has no quotes."};
            }
        },
    },
};
