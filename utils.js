const crypto = require('crypto');
const fs = require('fs');

module.exports = {
	generateTempFile(content, time) {
		let filename = crypto.randomBytes(10).toString('hex');
		let path = './public/' + filename + '.html';
		fs.writeFileSync(path, content);
		setTimeout(() => fs.unlinkSync(path), 1000 * 60 * time);
		return filename + '.html';
	},
};
