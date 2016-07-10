'use strict';

global.Data = {};

module.exports = {
	databases: {},

	addDatabase(id, loader, writer) {
		if (this.databases[id]) return false;

		this.databases[id] = {};
		this.databases[id].loader = loader;
		this.databases[id].writer = writer;

		this.loadDatabase(id);
	},

	loadDatabase(id) {
		if (!this.databases[id]) return false;

		let value = this.databases[id].loader();

		Data[id] = value || {};
	},

	writeDatabase(id) {
		if (!this.databases[id]) return false;

		if (this.databases[id].writing) {
			this.databases[id].writePending = true;
			return false;
		}

		let cooldown = this.databases[id].writer() || 0;
		setTimeout(() => {
			this.databases[id].writing = false;

			if (this.databases[id].writePending) {
				this.writedataBase(id);
			}
		}, cooldown);
	},

	reloadDatabases() {
		for (let id in this.databases) {
			this.loadDatabase(id);
		}
	},
};
