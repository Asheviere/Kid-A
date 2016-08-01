'use strict';

const server = require('../server.js');

const WIFI_ROOM = 'wifi';
const BREEDING_ROOM = 'breeding';

const wifiFaq = {
	checkOT: 'Obtaining breeding dittos: http://pastebin.com/6urss0zJ  Be aware that these dittos are for breeding purposes only as trading illegitimate Pokemon is banned.',
	dittos: 'Obtaining breeding dittos: http://pastebin.com/6urss0zJ  Be aware that these dittos are for breeding purposes only as trading illegitimate Pokemon is banned.',
	ditto: 'Obtaining breeding dittos: http://pastebin.com/6urss0zJ  Be aware that these dittos are for breeding purposes only as trading illegitimate Pokemon is banned.',
	shitpeoplesay: 'Commonly used trading terms and abbreviations: https://docs.google.com/document/d/1R89jufvCoQ9u_4jvFR0SnM2GeQGtRgABfLKRgZEfavs/edit',
	jargon: 'Commonly used trading terms and abbreviations: https://docs.google.com/document/d/1R89jufvCoQ9u_4jvFR0SnM2GeQGtRgABfLKRgZEfavs/edit',
	lingo: 'Commonly used trading terms and abbreviations: https://docs.google.com/document/d/1R89jufvCoQ9u_4jvFR0SnM2GeQGtRgABfLKRgZEfavs/edit',
	ss: 'How to take a screenshot: http://www.take-a-screenshot.org',
	screenshot: 'How to take a screenshot: http://www.take-a-screenshot.org',
	chaining: 'Pokemon "chaining" does not exist. Evidence shows that using the dexnav only makes the shiny chance 1/512 for EVERY encounter',
	contributions: 'Please Fill out the form if you have any Bot development ideas:https://docs.google.com/forms/d/19G7PKb9Ehcut-I8g--f1hkJyenZPEmg6Szq2LxGi590/viewform',
	hackcheckers: 'List of staff that can hackcheck: http://pastebin.com/7LZfXDPk',
	cloners: 'List of approved cloners: ' + server.url + 'wifi/cloners',
	cloner: 'List of approved cloners: ' + server.url + 'wifi/cloners',
	scammer: 'List of known scammers: ' + server.url + 'wifi/scammers',
	scammers: 'List of known scammers: ' + server.url + 'wifi/scammers',
	training: 'List of approved EV trainers: ' + server.url + 'wifi/trainers',
	trainers: 'List of approved EV trainers: ' + server.url + 'wifi/trainers',
	trainer: 'List of approved EV trainers: ' + server.url + 'wifi/trainers',
	onlinecloners: 'Cloners that are currently online: ' + server.url + 'wifi/ocloners',
	ocloners: 'Cloners that are currently online: ' + server.url + 'wifi/ocloners',
	ev: 'List of approved EV trainers: ' + server.url + 'wifi/trainers',
	intro: 'Welcome to Wi-Fi! Here is a link to our forums: http://showdownwifi.freeforums.org/index.php',
	faq: 'Wi-Fi room FAQs: http://pswifi.freeforums.org/faq.php',
	faqs: 'Wi-Fi room FAQs: http://pswifi.freeforums.org/faq.php',
	bans: 'http://showdownwifi.freeforums.org/ban-appeals-f4.html',
	banappeals: 'http://showdownwifi.freeforums.org/ban-appeals-f4.html',
	tt: 'EV trainer test information: https://docs.google.com/document/d/1eKzzvcZ1zWZXU_GyFhhBUT2wj4dMaiJOCnn669VR83U',
	trainingtest: 'EV trainer test information: https://docs.google.com/document/d/1eKzzvcZ1zWZXU_GyFhhBUT2wj4dMaiJOCnn669VR83U',
	trainerstest: 'EV trainer test information: https://docs.google.com/document/d/1eKzzvcZ1zWZXU_GyFhhBUT2wj4dMaiJOCnn669VR83U',
	bp: 'Breeding probability tool: http://destinyknot.tk',
	breedingprobability: 'Breeding probability tool: http://destinyknot.tk',
	ga: 'Hosting giveaways information: https://docs.google.com/document/d/1CyNoWZYFmFxTOu489ECv1nFV7PWvDPhEncqFXhRXC1M',
	giveaway: 'Hosting giveaways information: https://docs.google.com/document/d/1CyNoWZYFmFxTOu489ECv1nFV7PWvDPhEncqFXhRXC1M',
	giveaways: 'Hosting giveaways information: https://docs.google.com/document/d/1CyNoWZYFmFxTOu489ECv1nFV7PWvDPhEncqFXhRXC1M',
	destinyknot: 'Calculate the chances of certain IVs passing down http://mkwrs.com/destiny_knot/',
	dk: 'Calculate the chances of certain IVs passing down http://mkwrs.com/destiny_knot/',
	funfact: 'Fun fact - You don\'t have to post those pesky commands in the chat. We prefer you PM them directly to me so you don\'t clog up chat.',
	rng: 'RNG Abuse is used to counteract the RNG (the randomness system in pokemon games) to achieve good IVs or shiny pokemon easier',
	rnglist: 'RNGer\'s list - https://docs.google.com/spreadsheets/d/1gJZZLbqUqBXxs6eOBd3xexaHE39bmgODy8ZxNuDLwuI/edit#gid=0',
	rnguide: 'RNG\'ing guide: https://www.reddit.com/r/pokemonrng/wiki/links',
	rngguide: 'RNG\'ing guide: https://www.reddit.com/r/pokemonrng/wiki/links',
	iv: 'IV calc: http://www.serebii.net/games/iv-calcxy.shtml or http://www.metalkid.info/pokemon/calculators/iv.aspx',
	ivcalc: 'IV calc: http://www.serebii.net/games/iv-calcxy.shtml or http://www.metalkid.info/pokemon/calculators/iv.aspx',
	editor: 'Finding a person to test you for approved cloning and approved training is as easy as finding an editor. Editor\'s names can be found simply by visiting the list for which you are trying to join and looking at the top of the list.',
	editors: 'Finding a person to test you for approved cloning and approved training is as easy as finding an editor. Editor\'s names can be found simply by visiting the list for which you are trying to join and looking at the top of the list.',
	hc: 'Simple hackchecks: https://docs.google.com/document/d/1-pBU5oDgOJYsemSWguBoPEr4YGfUvSTNcsuEZJBvX-s/edit',
	hackchecks: 'Simple hackchecks: https://docs.google.com/document/d/1-pBU5oDgOJYsemSWguBoPEr4YGfUvSTNcsuEZJBvX-s/edit',
	hackcheck: 'Simple hackchecks: https://docs.google.com/document/d/1-pBU5oDgOJYsemSWguBoPEr4YGfUvSTNcsuEZJBvX-s/edit',
	bankballs: 'Ball legality: www.serebii.net/games/pokeball.shtml',
	bankball: 'Ball legality: www.serebii.net/games/pokeball.shtml',
	bb: 'Ball legality: www.serebii.net/games/pokeball.shtml',
	gen1bb: 'Ball legality: http://www.serebii.net/games/geniball.shtml',
	gen2bb: 'Ball legality: http://www.serebii.net/games/geniiball.shtml',
	gen3bb: 'Ball legality: http://www.serebii.net/games/geniiiball.shtml',
	gen4bb: 'Ball legality: http://www.serebii.net/games/genivball.shtml',
	gen5bb: 'Ball legality: http://www.serebii.net/games/genvball.shtml',
	gen6bb: 'Ball legality: http://www.serebii.net/games/genviball.shtml',
	breeding: 'Breeding guide: https://docs.google.com/document/d/1N_gUZe-9N08aWeURGi1bdF1h-gEhSXaa9ikHnOIznSg/edit',
	breedingguide: 'Breeding guide: https://docs.google.com/document/d/1N_gUZe-9N08aWeURGi1bdF1h-gEhSXaa9ikHnOIznSg/edit',
	formatting: 'How to use text effects: Click the gear (__Top Right__), then click the ``Edit Formatting`` button. Test these effects by PM\'ing me otherwise you will get warned or muted!',
	fm: 'How to use text effects: Click the gear (__Top Right__), then click the ``Edit Formatting`` button. Test these effects by PM\'ing me otherwise you will get warned or muted!',
	tsv: 'TSV hatching list: https://docs.google.com/spreadsheets/d/1EyDe0jZU_7_0jpGSX7cV6B9Xj0MSaaEYkLsV-266PkU/edit#gid=0',
	tsvform: 'TSV registration form: https://docs.google.com/forms/d/1bOniZhkHL_2QKkDiAacsngtliGH9R15dy0dT5CgNiPA/viewform?usp=send_form',
	src: 'The chance of getting a 6IV Non-Shiny Legend in Gen 6 w/ good nature is 1/65,536 or (0.000015%). The chance of encountering a 6IV Good Natured Shiny Legend is 1/536,870,912 or (0.0000000019%). Think again before you claim yours as legit.',
	fc: 'Find your Friend Code by going to your 3ds home screen, then click the orange smiley icon [:)], finally scroll over to your friend card and your friend code will be listed on the top screen.',
	hp: 'Hidden Power chart: http://psbreeding.weebly.com/hpchart.html',
	hpchart: 'Hidden Power chart: http://psbreeding.weebly.com/hpchart.html',
	cloninginfo: 'The cloning information sheet https://docs.google.com/document/d/1VkaiWSi3u-H6pc-o29YYxlrxkGwzghuB5NAfFTxoltc/edit',
	cloningtest: 'The cloning information sheet https://docs.google.com/document/d/1VkaiWSi3u-H6pc-o29YYxlrxkGwzghuB5NAfFTxoltc/edit',
	cloning: 'Cloning doesn\'t alter any data like hacking does. Without cloning, people would not trade rare or shiny Pokemon. It keeps the economy going and incentivizes trades. By using the Wi-Fi room, you should be aware that most Pokemon traded are cloned. If you don\'t like it, don\'t trade.',
	genderratio: 'Gender ratios: http://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_gender_ratio',
	gr: 'Gender ratios: http://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_gender_ratio',
	hacks: 'Hacked pokemon list: https://docs.google.com/spreadsheets/d/1aj7bIySJI1JwCD8KHeBOlZnG4Hg27KI12H8RiNynsmY/',
};

const breedingFaq = {
	dexapplication: 'Submit your self-bred’s and SR’s to the Breeding room’s Log here! https://docs.google.com/forms/d/1hvBtBvwLzRdHEhBlVSbgTGA0rhkECjJ4pOgRofeA4aI/viewform?c=0&w=1 ',
	logapplication: 'Submit your self-bred’s and SR’s to the Breeding room’s Log here! https://docs.google.com/forms/d/1hvBtBvwLzRdHEhBlVSbgTGA0rhkECjJ4pOgRofeA4aI/viewform?c=0&w=1 ',
	commands: 'List of commands https://docs.google.com/document/d/1v2mbC9G-PuPJbUqsI5NSwQzLRCUDbc4LiQRs7202vTI/edit',
	guide: 'List of commands https://docs.google.com/document/d/1v2mbC9G-PuPJbUqsI5NSwQzLRCUDbc4LiQRs7202vTI/edit',
	command: 'List of commands https://docs.google.com/document/d/1v2mbC9G-PuPJbUqsI5NSwQzLRCUDbc4LiQRs7202vTI/edit',
	tsv: 'TSV Hatching List https://docs.google.com/spreadsheets/d/1EyDe0jZU_7_0jpGSX7cV6B9Xj0MSaaEYkLsV-266PkU/edit#gid=0',
	tsvform: 'TSV Form docs.google.com/forms/d/1bOniZhkHL_2QKkDiAacsngtliGH9R15dy0dT5CgNiPA/viewform?usp=send_form“',
	lingo: 'Commonly used trading terms and abbreviations: https://docs.google.com/document/d/1R89jufvCoQ9u_4jvFR0SnM2GeQGtRgABfLKRgZEfavs/edit',
	jargon: 'Commonly used trading terms and abbreviations: https://docs.google.com/document/d/1R89jufvCoQ9u_4jvFR0SnM2GeQGtRgABfLKRgZEfavs/edit',
	intro: 'Welcome to the Breeding room! Check out our website! http://psbreeding.weebly.com/',
	destinyknot: 'Calculate the chances of certain IVs passing down  http://mkwrs.com/destiny_knot/',
	dk: 'Calculate the chances of certain IVs passing down  http://mkwrs.com/destiny_knot/',
	bp: 'Calculate the chances of certain IVs passing down  http://mkwrs.com/destiny_knot/',
	funfact: 'Fun fact - You don\'t have to post those pesky commands in the chat. We prefer you PM them directly to me so you don\'t clog up chat.',
	rnguide: 'RNG\'ing guide: https://www.reddit.com/r/pokemonrng/wiki/links',
	rngguide: 'RNG\'ing guide: https://www.reddit.com/r/pokemonrng/wiki/links',
	iv: 'IV calc: http://www.serebii.net/games/iv-calcxy.shtml',
	ivcalc: 'IV calc: http://www.serebii.net/games/iv-calcxy.shtml',
	hc: 'Simple hackchecks: http://www.smogon.com/forums/threads/read-me-tips-for-simple-hack-checks.3498670/',
	hackchecks: 'Simple hackchecks: http://www.smogon.com/forums/threads/read-me-tips-for-simple-hack-checks.3498670/',
	hackcheck: 'Simple hackchecks: http://www.smogon.com/forums/threads/read-me-tips-for-simple-hack-checks.3498670/',
	bankballs: 'Ball legality: www.serebii.net/games/pokeball.shtml',
	bankball: 'Ball legality: www.serebii.net/games/pokeball.shtml',
	bb: 'Ball legality: www.serebii.net/games/pokeball.shtml',
	bg: 'Breeding Guide: https://docs.google.com/document/d/1N_gUZe-9N08aWeURGi1bdF1h-gEhSXaa9ikHnOIznSg/edit',
	breedingguide: 'Breeding Guide: https://docs.google.com/document/d/1N_gUZe-9N08aWeURGi1bdF1h-gEhSXaa9ikHnOIznSg/edit',
	breeding: 'Breeding Guide: https://docs.google.com/document/d/1N_gUZe-9N08aWeURGi1bdF1h-gEhSXaa9ikHnOIznSg/edit',
	formatting: 'How to use text effects: Click the gear (__Top Right__), then click the ``Edit Formatting`` button. Test these effects by PM\'ing me otherwise you will get warned or muted!',
	fm: 'How to use text effects: Click the gear (__Top Right__), then click the ``Edit Formatting`` button. Test these effects by PM\'ing me otherwise you will get warned or muted!',
	dittos: 'How to use text effects: Click the gear (__Top Right__), then click the ``Edit Formatting`` button. Test these effects by PM\'ing me otherwise you will get warned or muted!',
	ditto: 'Obtaining breeding dittos: https://www.reddit.com/r/BreedingDittos/ Be aware that these dittos are for breeding purposes only as trading illegitimate Pokemon is banned.',
	hp: 'Hidden Power chart: http://psbreeding.weebly.com/hpchart.html',
	hpchart: 'Hidden Power chart: http://psbreeding.weebly.com/hpchart.html',
	genderratio: 'Gender ratios: http://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_gender_ratio',
	gr: 'Gender ratios: http://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_gender_ratio',
	ig: 'Ball inheritance guide: http://www.smogon.com/forums/threads/special-pok%C3%A9-ball-inheritance-guide-gp-1-1.3498616/',
	inheritanceguide: 'Ball inheritance guide: http://www.smogon.com/forums/threads/special-pok%C3%A9-ball-inheritance-guide-gp-1-1.3498616/',
	log: 'Breeding room\'s shiny dex: https://docs.google.com/spreadsheets/d/1lRMLqjA_Bim_tSD5vWLPsuL6S38Og0fbCDH5Cn517IQ/edit#gid=235414700',
	dex: 'Breeding room\'s shiny dex: https://docs.google.com/spreadsheets/d/1lRMLqjA_Bim_tSD5vWLPsuL6S38Og0fbCDH5Cn517IQ/edit#gid=235414700',
	src: 'The chance of getting a 6IV Non-Shiny Legend in Gen 6 w/ good nature is 1/65,536 or (0.000015%). The chance of encountering a 6IV Good Natured Shiny Legend is 1/536,870,912 or (0.0000000019%). Think again before you claim yours as legit.',
};

module.exports = {
	commands: {
		faq(userstr, room, message) {
			if (!canUse(userstr, 1)) return this.pmreply("Permission denied.");
			if (!room) room = WIFI_ROOM;
			let faqList = {};
			if (room === WIFI_ROOM) {
				faqList = wifiFaq;
			} else if (room === BREEDING_ROOM) {
				faqList = breedingFaq;
			} else {
				return this.pmreply("This command can only be used in the wifi or breeding room.");
			}

			if (!message) return this.reply("Usage: ``.faq <topic>``. For a list of topics, use ``.faq commands``.");
			message = toId(message);
			if (!(message in faqList)) return this.pmreply("Invalid option for topic.");

			return this.reply(faqList[message]);
		},
	},
};
