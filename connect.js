var WebSocketClient = require('websocket').client;

var retryTime = 5; // Time (in seconds) before the bot retries a failed connection.

var con;

function connect() {
    var client = new WebSocketClient();

    client.on('connectFailed', error => {
        console.log('Connection failed with error: ' + error + ". Retrying in " + retryTime + "s.");
        setTimeout(connect, retryTime * 1000);
    });

    client.on('connect', connection => {
        Connection = connection;
        console.log('WebSocket Client Connected');
        connection.on('error', error => {
            console.log("Error on connection" + connection + ": " + error + ". Reconnecting in " + retryTime + "s.");
            setTimeout(connect, retryTime * 1000);
        });
        connection.on('close', () => {
            console.log("Closed connection " + connection + ", reconnecting in " + retryTime + "s.");
            setTimeout(connect, retryTime * 1000);
        });
        connection.on('message', message => {
            Handler.parse(message.utf8Data);
        });
    });

    console.log("Connecting...");
    client.connect('ws://' + Config.host + ':' + Config.port + '/showdown/websocket');
}

connect();
