const request = require('request');

const TAVERN_BRAWL = 'tavernbrawl';
const QUERYURL = 'https://omgvamp-hearthstone-v1.p.mashape.com/cards/';
const STANDARD_SETS = ['Basic', 'Classic', 'Whispers of the Old Gods', 'One Night in Karazhan', 'Mean Streets of Gadgetzan', 'Journey to Un\'Goro', 'Knights of the Frozen Throne'];

function sanitizeCardText(text) {
	return text.replace('[x]', '').replace('\\n', '<br/>').replace('\\\n', '<br/>').replace('_', ' ').replace('$', '')
}

function generateCardDisplay(card, useGold) {
	let output = `<div class="broadcast-blue" style="background-image:url(http://i.imgur.com/FTEEgEW.jpg);background-size:100% auto;background-repeat: no-repeat;"><table style="text-align:center;margin:-13px auto -13px auto;"><tr>`;

	output += `<td style="width:140px;height:200px;"><img src="${useGold ? card.imgGold : card.img}" width="132" height="200"></td>`;

	output += `<td style="max-width:80%;text-align:center;text-shadow: 0px 0px 2px black">`;
	output += `<p style="font-size:13pt;"><b>${card.name}:</b></p>`;

	let stat = "";
	let typeStr = card.type;
	switch (card.type) {
	case 'Minion':
		stat = ` <b>${card.attack}/${card.health}</b>`;
		if (card.race) typeStr = card.race;
		break;
	case 'Weapon':
		stat = ` <b>${card.attack}/${card.durability}</b>`;
		break;
	case 'Hero':
		stat = ` <b>${card.armor} armor</b>`;
		break;
	}
	output += `<p><b>${card.cost}</b> mana${stat} ${card.multiClassGroup ? `${card.multiClassGroup} <small><i>(${card.classes.join(', ')})</i></small>` : card.playerClass} <b>${typeStr}</b> from <b><i>${card.cardSet}${STANDARD_SETS.includes(card.cardSet) ? '' : ' <small>(Wild)</small>'}</i></b></p>`;
	output += `<p>${sanitizeCardText(card.text)}</p>`;
	output += `<p style="font-style:italic;">${card.flavor}</p>`;

	output += `</td></tr></table></div>`;

	return output;
}

module.exports = {
	commands: {
		hs: {
			rooms: [TAVERN_BRAWL],
			permission: 1,
			disallowPM: true,
			async action(message) {
				if (!message) return this.pmreply("No card entered");
				let gold = false;
				if (message.endsWith(', gold') || message.endsWith(',gold')) {
					gold = true;
					message = message.slice(0, (message.endsWith(', gold') ? -6 : -5));
				}

				request(`${QUERYURL}${message}?collectible=1`, {
					headers: {
						'X-Mashape-Key': Config.mashapeKey,
					},
				}, (error, response, body) => {
					if (!error) {
						try {
							body = JSON.parse(body);
						} catch (e) {
							return this.reply("Malformed response.");
						}
						if (Array.isArray(body)) {
							return this.reply(`/addhtmlbox ${generateCardDisplay(body[0], gold)}`);
						} else if (body.error === 404) {
							return this.reply("Card not found.");
						}
						return this.reply(`**Error**: ${body.error} - ${body.message}`);
					}
					return this.reply("Something went wrong retrieving the card data.");
				});
			},
		},
	},
};