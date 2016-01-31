var fs = require('fs');
var sentiment = require('sentiment');

var data;
try {
    data = JSON.parse(fs.readFileSync('./data/data.json'));
} catch (e) {}

if (!Object.isObject(data)) data = {};

global.Data = data;

module.exports = {
    writeData: function() {
        if (this.writePending) return false;

        if (this.writing) {
            this.writePending = true;
            return;
        }
        writing = true;
        var toWrite = JSON.stringify(Data);

        fs.writeFile('./data/data.json', toWrite, () => {
            this.writing = false;
            if (this.writePending) {
                this.writeData();
            }
        });
    },

    linkAnalysis: function(room, message) {
        var pattern = /\.(com|org|net)/;

        if (!pattern.test(message)) return;

        var parts = message.split(' ');

        for (var i = 0; i < parts.length; parts++) {
            if (pattern.test(parts[i])) {
                var link = parts[i];
                var split = link.split('/');

                if (split[0].indexOf(':') > -1) {
                    split.shift();
                }

                while (!split[0]) {
                    split.shift();
                }

                console.log("Someone linked " + split[0] + " in room " + room + ".");

                if (!Data[room]) Data[room] = {};
                if (!Data[room].links) Data[room].links = {};

                Data[room].links[split[0]] = Data[room].links[split[0]] + 1 || 1;

                this.writeData();
            }
        }
    },

    sentimentAnalysis: function(room, message) {
        // Don't even bother with messages that are just emoticons.
        if (toId(message).length < 2) return false;

        var smt = sentiment(message);

        if (!smt.words.length) return false;

        if (!Data[room]) Data[room] = {};
        if (!Data[room].sentiment) Data[room].sentiment = {score: smt.score, n: 1};

        Data[room].sentiment.score = (Data[room].sentiment.score + smt.score) / ++Data[room].sentiment.n;

        this.writeData();
    },

    analyze: function(room, message) {
        this.linkAnalysis(room, message);
        this.sentimentAnalysis(room, message);
    }
}
