'use strict';

// Taken from the PS client
const domainRegex = '[a-z0-9\\-]+(?:[.][a-z0-9\\-]+)*';
const parenthesisRegex = '[(](?:[^\\s()<>&]|&amp;)*[)]';
const linkRegex = new RegExp(
	'\\b' +
	'(?:' +
		'(' +
			// When using www. or http://, allow any-length TLD (like .museum)
			'(?:https?://|www[.])' + domainRegex +
			'|' + domainRegex + '[.]' +
				// Allow a common TLD, or any 2-3 letter TLD followed by : or /
				'(?:com?|org|net|edu|info|us|jp|[a-z]{2,3}(?=[:/]))' +
		')' +
		'(?:[:][0-9]+)?' +
		'\\b' +
		'(?:' +
			'/' +
			'(?:' +
				'(?:' +
					'[^\\s()&]|&amp;|&quot;' +
					'|' + parenthesisRegex +
				')*' +
				// URLs usually don't end with punctuation, so don't allow
				// punctuation symbols that probably aren't related to URL.
				'(?:' +
					'[^\\s`()\\[\\]{}\'".,!?;:&]' +
					'|' + parenthesisRegex +
				')' +
			')?' +
		')?' +
		'|[a-z0-9.]+\\b@' + domainRegex + '[.][a-z]{2,3}' +
	')',
	'ig'
);
const httpRegex = /https?:\/\/|www[.]/;

module.exports = {
	analyzer: {
		async parser(message) {
			let match;
			while ((match = linkRegex.exec(message)) !== null) {
					let host = match[1].replace(httpRegex, '');

					this.data.hincrby(`links:${this.room}`, host, 1);
			}
		},

		async display(room) {
			let links = this.data.hgetall(`links:${room}`);

			let output = '<h2>Websites linked:</h2><ul>';
			for (let site in links) {
				output += `<li>${site}:\t${links[site]} times.</li>`;
			}
			output += '</ul>';
			return output;
		},
	},
};
