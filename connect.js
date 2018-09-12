'use strict';

const WebSocketClient = require('websocket').client;

const handler = require('./handler.js');

const RETRY_TIME = 10; // Time (in seconds) before the bot retries a failed connection.

function connect() {
	const client = new WebSocketClient();

	client.on('connectFailed', error => {
		Output.errorMsg(error, 'Connection failed. Retrying in ' + RETRY_TIME + 's.');
		setTimeout(connect, RETRY_TIME * 1000);
	});

	client.on('connect', connection => {
		Connection = connection;
		Output.log('status', 'WebSocket Client Connected');
		connection.on('error', error => {
			Output.errorMsg(error, 'Error connecting. Retrying in ' + RETRY_TIME + 's.');
			setTimeout(connect, RETRY_TIME * 1000);
		});
		connection.on('close', () => {
			Output.log('client', 'Connection closed. Retrying in ' + RETRY_TIME + 's.');
			setTimeout(connect, RETRY_TIME * 1000);
		});
		connection.on('message', message => {
			handler.parse(message.utf8Data);
		});
	});

	Output.log('status', 'WebSocket Client Connecting...');
	client.connect('ws://' + Config.host + ':' + Config.port + '/showdown/websocket');
}

connect();
