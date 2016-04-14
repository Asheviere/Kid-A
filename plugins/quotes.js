module.exports = {
    quote: function (symbol, room, message) {
        if (!canUse(symbol, 2)) return {pmreply: "Permission denied."};
        if (!message.length) return {pmreply: "Please enter a valid quote."};

        if (!Data.quotes[room]) Data.quotes[room] = [];

        if (Data.quotes[room].indexOf(message) > -1) {
            return {pmreply: "Quote is already added."};
        } else {
            Data.quotes[room].push(message);
            return {pmreply: "Quote has been added."};
        }

        Handler.writeQuotes();
    },
};
