const crypto = require('crypto');
const fs = require('fs');

// Code for FC validation written by Scotteh.

function sha1bin(data) {
	 let generator = crypto.createHash('sha1');
	 generator.update(data, 'ascii');
	 return generator.digest();
}

function and(val1, val2) {
	// for more than 32bit integers
	// obtained from http://stackoverflow.com/a/3638080
	let shift = 0, result = 0;
	let mask = ~((~0) << 30); // Gives us a bit mask like 01111..1 (30 ones)
	let divisor = 1 << 30; // To work with the bit mask, we need to clear bits at a time
	while( (val1 !== 0) && (val2 !== 0) ) {
		let rs = (mask & val1) & (mask & val2);
		val1 = Math.floor(val1 / divisor); // val1 >>> 30
		val2 = Math.floor(val2 / divisor); // val2 >>> 30
		for(let i = shift++; i--;) {
			rs *= divisor; // rs << 30
		}
		result += rs;
	}
	return result;
}

// from https://stackoverflow.com/questions/2998784/how-to-output-integers-with-leading-zeros-in-javascript#comment21159788_2998822
function pad(num, size){ return ('000000000' + num).substr(-size); }


module.exports = {
	generateTempFile(content, time, html) {
		let extension = (html ? '.html' : '.txt');
		let filename = crypto.randomBytes(10).toString('hex');
		let path = './public/' + filename + extension;
		fs.writeFileSync(path, content);
		setTimeout(() => fs.unlinkSync(path), 1000 * 60 * time);
		return filename + extension;
	},
	validateFc(cleanedfc) {
		let fc = parseInt(cleanedfc.replace(/-/g, ''));
		if (fc < 0x0100000000 || fc > 0x7FFFFFFFFF) {
			return false;
		}
		let principalId = fc & 0xFFFFFFFF;
		let checksum = and(fc, 0xFF00000000)/4294967296;
		let bytes = pad((principalId).toString(16), 8);
		let a = bytes.match(/../g);
		a.reverse();
		let b = a.map(x => String.fromCharCode(parseInt(x, 16)));
		let binPrincipalId = b.join("");

		return (sha1bin(binPrincipalId)[0] >> 1) === checksum;
	},
};
