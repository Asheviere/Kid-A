const crypto = require('crypto');
const fs = require('fs');

module.exports = {
	generateTempFile(content, time, html) {
		let extension = (html ? '.html' : '.txt');
		let filename = crypto.randomBytes(10).toString('hex');
		let path = './public/' + filename + extension;
		fs.writeFileSync(path, content);
		setTimeout(() => fs.unlinkSync(path), 1000 * 60 * time);
		return filename + extension;
	},
};
