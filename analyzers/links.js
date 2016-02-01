module.exports = {
    parser: function(room, message) {
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

                Handler.writeData();
            }
        }
    },

    display: function(room) {
        var output = 'Websites linked:<br/>';
        for (var site in Data[room].links) {
            output += site + ':\t' + Data[room].links[site] + ' times.<br/>';
        }
        return output;
    }
}
