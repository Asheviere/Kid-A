var profanityList = [
    'fuck', 'shit', 'cock', 'dick', 'pussy', 'roastie', 'cunt',
    'autist', 'aspie', 'retard', 'cuck', 'cuckold',
    'nigger', 'fag', 'faggot', 'meanie', 'poopyhead', 'kike', 'spic', 'sandnigger', 'pinoy', 'nigga', 'mexican',
    'tymp', 'tympy', 'tympani'
];

module.exports = {
    parser: function(room, message) {
        // Don't even bother with messages that are just emoticons.
        if (toId(message).length < 2) return false;

        var words = message.split(' ');

        var profanities = 0;
        for (var i = 0; i < words.length; i++) {
            if (profanityList.indexOf(toId(words[i])) > -1) {
                profanities++;
            }
        }

        if (!Data[room]) Data[room] = {};
        if (!Data[room].profanities) {
            Data[room].profanities = {count: profanities, total: words.length};
        } else {
            Data[room].profanities.count += profanities;
            Data[room].profanities.total += words.length;
        }

        Handler.writeData();
    },

    display: room => 'Percentage of words said that are swear words: ' + (Data[room].profanities ? Data[room].profanities.count / Data[room].profanities.total * 100 : 0),
}
