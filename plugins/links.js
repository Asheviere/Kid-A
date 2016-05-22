module.exports = {
	analyzer: {
		parser: function(room, message) {
			var pattern = /\.(com|org|net)/;

			if (!pattern.test(message)) return;

			var parts = message.split(' ');

			for (var i = 0; i < parts.length; parts++) {
				if (parts[i].length > 100) return;

				if (pattern.test(parts[i])) {
					var link = parts[i];
					var split = link.split('/');

					if (split[0].indexOf(':') > -1) {
						split.shift();
					}

					while (!split[0]) {
						split.shift();
					}

					if (!Data.data[room]) Data.data[room] = {};
					if (!Data.data[room].links) Data.data[room].links = {};

					Data.data[room].links[sanitize(split[0])] = Data.data[room].links[sanitize(split[0])] + 1 || 1;
				}
			}
		},

		display: function(room) {
			var output = 'Websites linked:<br/>';
			for (var site in Data.data[room].links) {
				output += site + ':\t' + Data.data[room].links[site] + ' times.<br/>';
			}
			return output;
		}
	}
};
