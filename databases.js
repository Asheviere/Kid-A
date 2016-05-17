global.Data = {};

module.exports = {
	databases: {},

	addDatabase: function(id, loader, writer) {
		if (this.databases[id]) return false;

		this.databases[id] = {};
		this.databases[id].loader = loader;
		this.databases[id].writer = writer;

		this.loadDatabase(id);
	},

	loadDatabase: function(id) {
		if (!this.databases[id]) return false;

		var value = this.databases[id].loader();

		if (value) Data[id] = value;
	},

	writeDatabase: function(id) {
		if (!this.databases[id]) return false;

		if (this.databases[id].writing) {
			this.databases[id].writePending = true;
			return false;
		}

		var cooldown = this.databases[id].writer() || 0;
		setTimeout((() => {
			this.databases[id].writing = false;

			if (this.databases[id].writePending) {
				this.writedataBase(id);
			}
		}), cooldown);
	},

	reloadDatabases: function() {
		for (var id in this.databases) {
			this.loadDatabase(id);
		}
	}
};
