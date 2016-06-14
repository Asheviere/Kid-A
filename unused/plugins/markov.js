'use strict';

const markov = require('../markov/markov.js');
const loki = require('lokijs');
const fs = require('fs');

global.Markov = {};

function loadMarkov() {
	let autoload = false;
	try {
		autoload = fs.lstatSync('./data/markov.json').isFile();
	} catch (e) {
		fs.writeFileSync('./data/markov.json', '', 'utf8');
		autoload = true;
	} finally {
		Data.markov = new loki('./data/markov.json', {autoload});
	}

	Data.markov.loadDatabase();
}

function writeMarkov() {
	Data.markov.saveDatabase();
	return 30 * 60 * 1000;
}

Databases.addDatabase('markov', loadMarkov, writeMarkov);

const LIMIT = 16;

let cooldown = {};

module.exports = {
	analyzer: {
		parser(room, message) {
			if (Config.markovWhitelist.length && !Config.markovWhitelist.includes(room)) return;
			let words = message.split(' ');

			let toParse = [];
			for (let i = 0; i < words.length; i++) {
				if (!/( ?https?:\/\/.*\.[^ ]* ?)|\[.*\]|<<.*>>/.test(words[i]) && toId(words[i]).length) {
					toParse.push(words[i].replace(/``|__|\*\*|~~/g, ''));
				}
			}

			if (toParse.length < 3) return;

			if (!Markov[room]) {
				Markov[room] = markov(2);

				if (Data.markov.getCollection(room)) {
					Markov[room].db = Data.markov.getCollection(room);
				}
			}
			if (!Data.markov.getCollection(room)) {
				Markov[room].db = Data.markov.addCollection(room);
			}

			Markov[room].seed(toParse.join(' '));

			Databases.writeDatabase('markov');
		}
	},

	commands: {
		say(userstr, room, message) {
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};
			if (room && cooldown[room]) return {pmreply: "Please wait before using this again."};

			let generator = message;
			if (!generator) generator = room;

			if (generator === 'staff' && !(room === 'staff' || (!room && canUse(userstr, 2)))) return {pmreply: "I'm not leaking staff to you."};

			if (!Markov[generator]) {
				if (!Data.markov.getCollection(generator)) return {pmreply: "Invalid room."};

				Markov[generator] = markov(2);
				Markov[generator].db = Data.markov.getCollection(generator);
			}

			if (room) {
				cooldown[room] = true;
				setTimeout(() => delete cooldown[room], 10 * 1000);
			}
			return {reply: Markov[generator].fill(Markov[generator].pick(), LIMIT).join(' ')};
		},

		reply(userstr, room, message) {
			if (!canUse(userstr, 1)) return {pmreply: "Permission denied."};
			if (room && cooldown[room]) return {pmreply: "Please wait before using this again."};
			if (!message) return {pmreply: "Please enter a message to get a reply for."};

			let generator = room;
			if (!generator) {
				let rooms = Data.markov.listCollections();
				for (let i = 0; i < rooms.length; i++) {
					if (rooms[i].name === 'staff') {
						rooms.splice(i, 1);
						break;
					}
				}
				generator = rooms[Math.floor(Math.random() * rooms.length)].name;
			}

			if (!Markov[generator]) {
				if (!Data.markov.getCollection(generator)) return {pmreply: "Invalid room."};

				Markov[generator] = markov(2);
				Markov[generator].db = Data.markov.getCollection(generator);
			}

			if (room) {
				cooldown[room] = true;
				setTimeout(() => delete cooldown[room], 10 * 1000);
			}
			return {reply: Markov[generator].respond(message, LIMIT).join(' ')};
		}
	}
};
