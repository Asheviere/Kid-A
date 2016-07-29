'use strict';

const databases = require('../databases.js');
const db = databases.getDatabase('data');

module.exports = {
	analyzer: {
		parser(room, message) {
			// FIXME: get a better URL regex!!
			let pattern = /(?!href).+\.(nl|be|com|org|net)/;
			if (!pattern.test(message)) return;

			message.split(' ')
				.filter((w) => w.length <= 100 && pattern.test(w))
				.forEach((link) => {
					let idx = link.indexOf('//') + 2;
					let parts = link.substr(idx).split('/');
					let hostname = parts[0];

					if (!db[room]) db[room] = {};
					if (!db[room].links) db[room].links = {};

					db[room].links[sanitize(hostname)] = db[room].links[sanitize(hostname)] + 1 || 1;
				});
		},

		display(room) {
			let output = '<h2>Websites linked:</h2><ul>';
			for (let site in db[room].links) {
				output += '<li>' + site + ':\t' + db[room].links[site] + ' times.</li>';
			}
			output += '</ul>';
			return output;
		},
	},
};
