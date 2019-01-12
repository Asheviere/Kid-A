'use strict';

const WebSocket = require('faye-websocket').Client;
const deflate   = require('permessage-deflate');

const handler = require('./handler.js');

const RETRY_TIME = 10; // Time (in seconds) before the bot retries a failed connection.

function connect() {
	const protocol = Config.port === 443 ? 'wss' : 'ws';
	const url     = `${protocol}://${Config.host}:${Config.port}/showdown/websocket`;
	Output.log('status', 'WebSocket client connecting...');

	const client = new WebSocket(url, [], {extensions: [deflate]});

	client.onopen = () => {
		Output.log(`Connected to ${url}`);
	};

	client.onerror = error => {
		Output.errorMsg(error, `Error connecting. Reconnecting in ${RETRY_TIME}s...`);
		setTimeout(connect, RETRY_TIME * 1000);
	};

	client.onclose = close => {
		Output.log(`Closed connection with code ${close.code}. Reconnecting in ${RETRY_TIME}s...`);
		setTimeout(connect, RETRY_TIME * 1000);
	};

	client.onmessage = message => {
		handler.parse(message.data);
	};
}

connect();
