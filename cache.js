'use strict';

const fs = require('fs');

class Cache {
	constructor(plugin) {
		this.name = toId(plugin);

		try {
			this.data = fs.readFileSync(`./cache/${this.name}.json`);
		} catch (e) {
			this.data = {};
		}
	}

	get(key) {
		if (!(key in this.data)) return {};

		return this.data[key];
	}

	write() {
		fs.writeFileSync(`./cache/${this.name}.json`, JSON.stringify(this.data));
	}
}

module.exports = Cache;
