// Most of the mail functions are implemented centrally in command-parser.js, which allows all plugins to send mail. This plugin only deals with users sending other users mail.

module.exports = {
	commands: {
		mail: {
			async action(message) {
				let hasPerms = !this.room && this.auth !== ' ';
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

				if (this.sendMail(this.userid, target, toSend)) {
					this.reply(`Mail successfully scheduled for ${target}.`);
				} else {
					this.reply(`${target}'s inbox is full.`);
				}
			},
		},
		cancelmail: {
			hidden: true,
			permission: 6,
			async action(message) {
				const userid = toId(message);
				for (let inbox in ChatHandler.mail.data) {
					ChatHandler.mail.data[inbox] = ChatHandler.mail.data[inbox].filter(val => toId(val.sender) !== userid);
				}
				ChatHandler.mail.write();

				this.reply(`Canceled all mail from ${userid}`);
			},
		},
	},
};
