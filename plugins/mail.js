// Shamelessly taken from Mystifi's work for Kobold Librarian. TODO: make a proper plugin myself

const Cache = require('../cache.js');

let cache = new Cache('mail');

const MONTH = 31 * 24 * 60 * 60 * 1000;

function toDurationString(number) {
	// TODO: replace by Intl.DurationFormat or equivalent when it becomes available (ECMA-402)
	// https://github.com/tc39/ecma402/issues/47
	const date = new Date(+number);
	const parts = [date.getUTCFullYear() - 1970, date.getUTCMonth(), date.getUTCDate() - 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
	const unitNames = ["second", "minute", "hour", "day", "month", "year"];
	const positiveIndex = parts.findIndex(elem => elem > 0);
	return parts.slice(positiveIndex).reverse().map((value, index) => value ? `${value} ${unitNames[index]}${value > 1 ? 's' : ''}` : "").reverse().join(" ").trim();
}

// Prune mail scheduled over a month ago.
for (let [curUser, messages] of Object.entries(cache.data)) {
	messages = messages.filter(({time}) => Date.now() - time < MONTH);
	if (messages) {
		cache.set(curUser, messages);
	} else {
		delete cache.data[curUser];
	}
}
cache.write();

module.exports = {
	onUserJoin: {
		async action(user) {
			user = toId(user);
			let inbox = cache.get(user);
			if (Array.isArray(inbox)) {
				for (let {sender, message, time} of inbox) {
					Connection.send(`|/pm ${user}, [${toDurationString(Date.now() - time)} ago] **${sender}**: ${message}`);
				}
				delete cache.data[user];
				cache.write();
			}
		},
	},
	commands: {
		mail: {
			async action(message) {
				let hasPerms = !this.room && this.canUse(1);
				if (!hasPerms) {
					for (let room in this.userlists) {
						if (this.userlists[room][this.userid]) {
							const rank = this.userlists[room][this.userid][0];
							if (rank !== '+' && rank !== ' ') {
								hasPerms = true;
								break;
							}
						}
					}
				}
				if (!hasPerms) return this.pmreply(`Only roomstaff and global auth are allowed to use .mail.`);
				let [target, ...toSend] = message.split(',');
				target = toId(target);
				toSend = toSend.join(',').trim();
				if (!(target && toSend)) return this.pmreply(`Syntax: \`\`.mail user, message\`\``);
				if (toSend.length > 250) return this.pmreply(`Your message is too long. (${toSend.length}/250)`);

				let inbox = cache.get(target);
				if (!Array.isArray(inbox)) inbox = [];
				if (inbox.length >= 5) return this.pmreply(`${target}'s inbox is full.`);
				cache.set(target, inbox.concat({sender: this.userid, message: toSend, time: Date.now()}));
				cache.write();

				return this.reply(`Mail successfully scheduled for ${target}.`);
			},
		},
	},
};
