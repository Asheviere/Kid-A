'use strict';

const fs = require('fs');

class Cache {
	constructor(plugin) {
		this.name = toId(plugin);

		try {
			this.data = JSON.parse(fs.readFileSync(`./cache/${this.name}.json`));
		} catch (e) {
			this.data = {};
		}
	}

	get(key) {
		if (!(key in this.data)) return {};

		return this.data[key] || {};
	}

	set(key, value) {
		this.data[key] = value;
	}

	setProperty(key, property, value) {
		if (!this.data[key]) this.data[key] = {};
		this.data[key][property] = value;
	}

	deleteProperty(key, property) {
		delete this.data[key][property];
	}

	write() {
		fs.writeFileSync(`./cache/${this.name}.json`, JSON.stringify(this.data));
	}
}

module.exports = Cache;
