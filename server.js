var http = require('http');
var connect = require('connect');
var serveStatic = require('serve-static');

console.log("Starting server...");

var site = connect();

site.use(serveStatic(__dirname + '/public'));

function generateRoomPage(req, res) {
    var room = req.originalUrl.split('/')[1];
    var content = '<!DOCTYPE html><html><head><link rel="stylesheet" type="text/css" href="style.css"><title>' + room + ' - Kid A</title></head><body>'
    content += 'Average sentiment: ' + (Data[room].sentiment ? Data[room].sentiment.score * 1000 : 0) + '<br/>';
    content += 'Websites linked:<br/>';
    for (var site in Data[room].links) {
        content += site + ':\t' + Data[room].links[site] + ' times.<br/>';
    }
    content += '</body></html>';
    res.end(content);
}

for (var room in Data) {
    site.use('/' + room, generateRoomPage);
}

site.use((req, res) => res.end("Invalid room."));

http.createServer(site).listen(8000);

console.log("Server started successfully.");
