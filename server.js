var http = require('http');
var connect = require('connect');
var serveStatic = require('serve-static');

console.log("Starting server...");

var site = connect();

site.use(serveStatic(__dirname + '/public'));

function generateRoomPage(req, res) {
	var room = req.originalUrl.split('/')[1];
	var content = '<!DOCTYPE html><html><head><link rel="stylesheet" type="text/css" href="style.css"><title>' + room + ' - Kid A</title></head><body>'
	for (var i in Handler.analyzers) {
		content += Handler.analyzers[i].display(room) + '<br/></br/>';
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
