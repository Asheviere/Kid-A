'use strict';

module.exports = {
	analyzer: {
		parser(room, message) {
			// FIXME: get a better URL regex!!
			let pattern = /!(href).+\.(com|org|net)/;
			if (!pattern.test(message)) return;

			message.split(' ')
				.filter((w) => w.length <= 100 && pattern.test(w))
				.forEach((link) => {
					let idx = link.indexOf('//') + 2;
					let parts = link.substr(idx).split('/');
					let hostname = parts[0];

					if (!Data.data[room]) Data.data[room] = {};
					if (!Data.data[room].links) Data.data[room].links = {};

					Data.data[room].links[sanitize(hostname)] = Data.data[room].links[sanitize(hostname)] + 1 || 1;
				});
		},

		display(room) {
			let output = '<h2>Websites linked:</h2><ul>';
			for (let site in Data.data[room].links) {
				output += '<li>' + site + ':\t' + Data.data[room].links[site] + ' times.</li>';
			}
			output += '</ul>';
			return output;
		}
	}
};
