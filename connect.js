'use strict';

const WebSocketClient = require('websocket').client;

const RETRY_TIME = 10; // Time (in seconds) before the bot retries a failed connection.

function connect() {
	const client = new WebSocketClient();

	client.on('connectFailed', error => {
		errorMsg('Connection failed with error: ' + error + '. Retrying in ' + RETRY_TIME + 's.');
		setTimeout(connect, RETRY_TIME * 1000);
	});

	client.on('connect', connection => {
		Connection = connection;
		statusMsg('WebSocket Client Connected');
		connection.on('error', error => {
			errorMsg(error + '. Reconnecting in ' + RETRY_TIME + 's.');
			setTimeout(connect, RETRY_TIME * 1000);
		});
		connection.on('close', () => {
			statusMsg('Closed connection, reconnecting in ' + RETRY_TIME + 's.');
			setTimeout(connect, RETRY_TIME * 1000);
		});
		connection.on('message', message => {
			Handler.parse(message.utf8Data);
		});
	});

	statusMsg('Connecting...');
	client.connect('ws://' + Config.host + ':' + Config.port + '/showdown/websocket');
}

connect();
