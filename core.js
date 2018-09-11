global.Output = {
	stdout: '',

	/**
	 * @param {string} type
	 * @param {string} msg
	 */
	log(type, msg) {
		msg = `${Output.getTimeStamp()} <${type.toUpperCase()}> ${msg}`;
		Output.stdout += msg + '\n';
		console.log(msg);
	},

	/**
	 * @param {Error} err
	 * @param {string} msg
	 * @param {Object} context
	 */
	errorMsg(err, msg, context = {}) {
		let contextStr = '';
		for (let k in context) {
			contextStr += `\n${k}: ${context[k]}`;
		}
		this.log('error', `${msg}\n${err.stack}${contextStr}`);
	},

	getTimeStamp() {
		const timeElem = string => (string < 10 ? '0' : '') + string;
		const time = new Date();
		return `[${timeElem(time.getHours())}:${timeElem(time.getMinutes())}]`;
	},
};

global.Debug = {
	logLvl: 0,
	/**
	 * @param {number} logLvl
	 * @param {string} msg
	 */
	log(logLvl, msg) {
		if (logLvl > this.logLvl) return;
		Output.log('debug', msg);
	},
};
