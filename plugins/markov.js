var markov = require('../markov/markov.js');

var LIMIT = 16;

var cooldown = {};

module.exports = {
    say: function(symbol, room, message) {
        if (!canUse(symbol, 1)) return {pmreply: "Permission denied."};
        if (cooldown[room]) return {pmreply: "Please wait before using this again."};

        var generator = message;
        if (!generator) generator = room;

        if (!Markov[generator]) {
            if (!Data.markov[generator]) return {pmreply: "Invalid room."};

            Markov[generator] = markov(2);
            Markov[generator].db = Data.markov[generator];
        }

        cooldown[room] = true;
        setTimeout(() => delete cooldown[room], 10 * 1000);
        return {reply: Markov[generator].fill(Markov[generator].pick(), 16).join(' ')};
    }
};
