function getPunishment(val) {
	switch (val) {
	case 1:
	case 2:
		return 'warn';
	case 3:
	case 4:
		return 'mute';
	case 5:
		return 'hourmute';
	default:
		return 'roomban';
	}
}

var punishments = {};

function punish(userid, ips, room, val, msg) {
	if (!punishments[room]) punishments[room] = {};
	if (!ips) return;
	for (var i = 0; i < ips.length; i++) {
		var max = val;
		if (ips[i] in punishments[room]) {
			punishments[room][ips[i]] += val;
			if (punishments[room][ips[i]] > max) max = punishments[room][ips[i]];
		} else {
			punishments[room][ips[i]] = val;
		}
		console.log(punishments);
		Connection.send(room + '|/' + getPunishment(max) + ' ' + userid + ',' + msg);
		setTimeout(() => punishments[room][ips[i]] -= val, 1000 * 60 * 10);
	}
}

var buffers = {};
var timer;

function addBuffer(userid, room, message) {
	if (!buffers[room]) buffers[room] = [];
	buffers[room].push([userid, message]);
	if (buffers[room].length > 8) buffers[room].splice(0, 1);
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => buffers[room] = [], 1000 * 30);
}

module.exports = {
	commands : {
		moderation: function(userstr, room, message) {
			if (!canUse(userstr, 5)) return {pmreply: "Permission denied."};
			if (!room) return {pmreply: "This command can't be used in PMs."};

			if (!Settings.modRooms) Settings.modRooms = [];

			message = toId(message);
			var index = Settings.modRooms.indexOf(room);

			switch (message) {
			case 'on':
			case 'true':
			case 'yes':
			case 'enable':
				if (index < 0) {
					Settings.modRooms.push(room);
					Databases.writeDatabase('settings');
					return {reply: "Bot moderation was turned on in this room."};
				}
				return {reply: "Bot moderation is already turned on."};
			case 'off':
			case 'false':
			case 'no':
			case 'disable':
				if (index > -1) {
					Settings.modRooms.splice(index, 1);
					Databases.writeDatabase('settings');
					return {reply: "Bot moderation was turned off in this room."};
				}
				return {reply: "Bot moderation is already turned off."};
			default:
				return {pmreply: "Invalid value. Use 'on' or 'off'."};
			}
		}
	},
	analyzer: {
		rooms: Settings.modRooms,
		parser: function(room, message, userstr) {
			if (canUse(userstr, 1)) return;

			var userid = toId(userstr);

			addBuffer(userid, room, message);

			var msgs = 0;
			var identical = 0;

			for (var i = 0; i < buffers[room].length; i++) {
				if (buffers[room][i][0] === userid) {
					msgs++;
					if (buffers[room][i][1] === message) identical++;
				}
			}

			if (msgs >= 6 || identical >= 3) {
				if (Config.checkIps) {
					Handler.checkIp(userid, (userid, ips) => {
						punish(userid, ips, room, 2, 'Bot moderation: flooding');
					});
				} else {
					punish(userid, [userid], room, 2, 'Bot moderation: flooding');
				}
			}

			// Moderation for caps and stretching copied from boTTT.
			var capsString = message.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);

			if (capsString && (capsString.length / toId(message).length) >= 0.8) {
				if (Config.checkIps) {
					Handler.checkIp(userid, (userid, ips) => {
						punish(userid, ips, room, 1, 'Bot moderation: caps');
					});
				} else {
					punish(userid, [userid], room, 1, 'Bot moderation: caps');
				}
			}

			if (/(.)\1{7,}/gi.test(message) || /(..+)\1{4,}/gi.test(message)) {
				if (Config.checkIps) {
					Handler.checkIp(userid, (userid, ips) => {
						punish(userid, ips, room, 1, 'Bot moderation: stretching');
					});
				} else {
					punish(userid, [userid], room, 1, 'Bot moderation: stretching');
				}
			}
		}
	}
};
