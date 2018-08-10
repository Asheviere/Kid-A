'use strict';

const redis = require('thunk-redis');
const fs = require('fs');

const {exec} = require('child_process');

let tables;

try {
	tables = require('./data/tables.json');
} catch (e) {}

if (!Array.isArray(tables)) tables = [];

function writeTables() {
	fs.writeFileSync('./data/tables.json', JSON.stringify(tables));
}

module.exports = {
	databases: {},
	tables: tables,

	useDatabase(name) {
		if (this.databases[name]) return this.databases[name];

		let i = this.tables.indexOf(name);
		if (i === -1) {
			i = this.tables.length;
			this.tables.push(name);
			writeTables();
		}

		let client = redis.createClient({database: i, usePromise: true});
		client.on('error', async error => {
			errorMsg(`Received ${error} from redis, restarting.`);
			await this.restart();
			client.clientConnect();
		});
		client.on('close', () => {
			client.clientConnect();
		})
		this.databases[name] = client;
		return client;
	},

	restart() {
		return new Promise(resolve => {
			exec(`rm /var/run/redis_6379.pid && /etc/init.d/redis_6379 start`, async () => {
				resolve();
			});
		});
	}
};
