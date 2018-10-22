'use strict';

const fs = require('fs');

class Cache {
	constructor(plugin) {
		this.name = toId(plugin);
		this.changed = false;

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
		Debug.log(2, `Writing /cache/${this.name}.json. Content: ${JSON.stringify(this.data)}`);
		if (!this.changed) {
			fs.unlink(`./cache/${this.name}.json.old`, () => {
				fs.rename(`./cache/${this.name}.json`, `./cache/${this.name}.json.old`, () => {
					fs.open(`./cache/${this.name}.json`, 'w+', (err, fd) => {
						if (err && err.code !== 'ENOENT') return Output.errorMsg(err, `Error opening cache file ${this.name}.json`);
						fs.writeFile(fd, JSON.stringify(this.data), err => {
							if (err) return Output.errorMsg(err, `Error writing cache file ${this.name}.json`);
							if (!err) fs.fdatasync(fd, () => {});
						});
					});
					this.changed = true;
				});
			});
		} else {
			fs.open(`./cache/${this.name}.json`, 'w+', (err, fd) => {
				if (err) return Output.errorMsg(err, `Error opening cache file ${this.name}.json`);
				fs.writeFile(fd, JSON.stringify(this.data), err => {
					if (err) return Output.errorMsg(err, `Error writing cache file ${this.name}.json`);
					if (!err) fs.fdatasync(fd, () => {});
				});
			});
		}
	}
}

module.exports = Cache;
