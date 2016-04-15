var markov = require('../markov/markov.js');

module.exports = {
    parser: function(room, message) {
        if (message.split(' ').length < 3) return;

        if (!Markov[room]) {
            Markov[room] = markov(2);

            if (Data.markov[room]) {
                Markov[room].db = Data.markov[room];
            }
        }
        if (!Data.markov[room]) {
            Data.markov[room] = Markov[room].db;
        }

        Markov[room].seed(message);

        Handler.writeMarkov();
    }
};
