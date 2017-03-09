'use strict';

const redis = require('thunk-redis');
const fs = require('fs');

let tables;

try {
    tables = require('./data/tables.json');
} catch (e) {}

if (typeof tables !== 'object' || Array.isArray(tables)) tables = [];

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

        let client = redis.createClient({database: name, usePromise: true});
        this.databases[name] = client;
        return client;
    },

    async getList(client, key) {
        let len = await client.llen(key);
        let ret = await client.lrange(key, 0, len);
        return ret;
    },
};