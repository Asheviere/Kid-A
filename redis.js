'use strict';

const redis = require('thunk-redis');

module.exports = {
	databases: {},
    indices: [],

	useDatabase(name) {
        if (this.databases[name]) return this.databases[name];

        let i = this.indices.indexOf(name);
        if (i === -1) {
            i = this.indices.length;
            this.indices.push(name);
        }

        let client = redis.createClient({database: i, usePromise: true});
        this.databases[name] = client;
        return client;
    },

    async getList(client, key) {
        let len = await client.llen(key);
        let ret = await client.lrange(key, 0, len);
        console.log(ret);
        return ret;
    },
};
