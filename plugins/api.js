const request = require('request');

const RELATED_LIMIT = 10;
const NASTY_GENRES = ['Hentai', 'Ecchi'];

let leftpad = val => (val < 10 ? `0${val}`: `${val}`);

async function malRequest(query, searchType = 'anime') {
	return new Promise((resolve, reject) => {
		request(`https://api.jikan.moe/v3/search/${searchType}/?q=${encodeURIComponent(query)}&page=1`, async (err, res) => {
			if (err) reject(err);
			let results = JSON.parse(res.body).results;
			// Filter out naughty stuff (shaking my head @ weebs)
			results = results.filter(result => !(result.rated && result.rated === 'Rx')).slice(0, RELATED_LIMIT);
			if (results.length) {
				const promises = results.map(result => new Promise((resolve, reject) => {
					request(`https://api.jikan.moe/v3/${searchType}/${result.mal_id}`, (err, res) => {
						if (err) reject(err);
						let entry = JSON.parse(res.body);
						const genres = entry.genres ? Object.keys(entry.genres).map(key => entry.genres[key].name) : '';
						resolve([genres, entry.title_japanese]);
					});
				}));
				for (let i = 0; i < promises.length; i++) {
					let [genres, japTitle] = await promises[i];

					results[i].genres = genres;
					results[i].title += ` (${japTitle})`;
				}
				results = results.filter(result => !(result.genres && result.genres.some(genre => NASTY_GENRES.includes(genre))));
			}
			resolve(results.map(result => ({title: result.title, image: {width: 75, height: 107, url: result.image_url}, url: result.url, properties: result})));
		});
	});
}

const igdbCache = new Map();

function igdbRequest(query) {
	return new Promise((resolve, reject) => {
		request.post(`https://api-v3.igdb.com/games`, {
			headers: {
				"user-key": Config.igdbKey,
				Accept: "application/json",
			},
			body: `fields *; search "${query}"; where version_parent = null;`,
		}, async (err, res) => {
			if (err) reject(err);
			const parsed = JSON.parse(res.body).map(entry => ({title: entry.name, url: entry.url, properties: entry}));
			if (parsed.length) {
				const gameid = parsed[0].properties.id;

				if (igdbCache.has(gameid)) {
					parsed[0].image = igdbCache.get(gameid);
				} else {
					const promise = new Promise((resolve, reject) => {
						request.post(`https://api-v3.igdb.com/covers`, {
							headers: {
								"user-key": Config.igdbKey,
								Accept: "application/json",
							},
							body: `fields url, height, width; where game = ${gameid};`,
						}, async (err, res) => {
							if (err) reject(err);
							const obj = JSON.parse(res.body)[0];
							obj.height = Math.floor(obj.height / 2.8);
							obj.width = Math.floor(obj.width / 2.8);
							resolve(obj);
						});
					});
					const obj = await promise;
					obj.url = `https:${obj.url}`;
					parsed[0].image = obj;
					igdbCache.set(gameid, obj);
				}
			}
			resolve(parsed.slice(0, RELATED_LIMIT));
		});
	});
}

class InfoBox {
	constructor(dataFetcher, generator) {
		this.dataFetcher = dataFetcher;
		this.generator = generator;
	}

	generateEntry(entry) {
		let html = '';

		const properties = this.generator(entry.properties);

		html += `<h3 style="margin:4px 7px;"><a href="${entry.url}" style="color:inherit;font-size: 13.5pt;">${entry.title}</a></h3>`;
		if (entry.image) {
			html += `<table><tr><td><img src="${entry.image.url}" width="${entry.image.width}" height="${entry.image.height}" style="margin: 3px 5px;"></td><td style="max-width: 600px;">${properties}</td></tr></table>`;
		} else {
			html += properties;
		}

		return html;
	}

	async parse(query) {
		let data = await this.dataFetcher(query);

		if (!data || !data.length) return;

		let buffer = '';

		buffer += this.generateEntry(data[0]);

		let rest = '';

		for (const entry of data.slice(1)) {
			rest += this.generateEntry(entry);
		}

		if (rest) {
			buffer += `<details><summary style="font-weight:bold;font-size:11.5pt;">Related:</summary><div style="max-height:200px;overflow: auto;">${rest}</div></details>`;
		}

		return buffer;
	}
}

const anime = new InfoBox(malRequest, properties => {
	let buffer = '';

	buffer += `<strong>Episodes:</strong> ${properties.episodes} | `;
	if (properties.airing) {
		buffer += `<strong style="color:green">Currently airing</strong>`;
	} else {
		let start = new Date(properties.start_date);
		let end = new Date(properties.end_date);

		const sameYear = start.getFullYear() === end.getFullYear();
		const sameMonth = start.getMonth() === end.getMonth();
		if (sameYear && sameMonth) {
			buffer += `Aired in ${start.getFullYear()}`;
		} else {
			buffer += `Aired from ${sameYear ? `${start.getFullYear()}-${leftpad(start.getMonth() + 1)}` : start.getFullYear()} to ${sameYear ? `${end.getFullYear()}-${leftpad(end.getMonth() + 1)}` : end.getFullYear()}`;
		}
	}
	const scoreColor = properties.score > 7 ? 'green' : properties.score < 5.5 ? 'red' : 'orange';
	buffer += `<br/><strong>Rated:</strong> ${properties.rated ? properties.rated.startsWith('R') ? `<span style="font-weight:bold;color:red;">${properties.rated}</span>` : properties.rated : `<span style="font-weight:bold;color:red;">Unrated</span>`} | <strong>User Score: <span style="color:${scoreColor};">${properties.score}/10</span></strong><br/>`;
	if (properties.genres) {
		buffer += `<strong>Genres:</strong> ${properties.genres.join(', ')}<br/>`;
	}

	buffer += `<strong>Synopsis:</strong> ${properties.synopsis}`;

	return buffer;
});

const manga = new InfoBox(query => malRequest(query, 'manga'), properties => {
	let buffer = '';

	buffer += `<strong>Volumes:</strong> ${properties.volumes} | <strong>Chapters:</strong> ${properties.chapters} | `;
	if (properties.publishing) {
		buffer += `<strong style="color:green">Currently publishing</strong>`;
	} else {
		let start = new Date(properties.start_date);
		let end = new Date(properties.end_date);

		const sameYear = start.getFullYear() === end.getFullYear();
		const sameMonth = start.getMonth() === end.getMonth();
		if (sameYear && sameMonth) {
			buffer += `Published in ${start.getFullYear()}`;
		} else {
			buffer += `Published from ${sameYear ? `${start.getFullYear()}-${leftpad(start.getMonth() + 1)}` : start.getFullYear()} to ${sameYear ? `${end.getFullYear()}-${leftpad(end.getMonth() + 1)}` : end.getFullYear()}`;
		}
	}
	const scoreColor = properties.score > 7 ? 'green' : properties.score < 5.5 ? 'red' : 'orange';
	buffer += `<br/><strong>User Score: <span style="color:${scoreColor};">${properties.score}/10</span></strong><br/>`;
	if (properties.genres) {
		buffer += `<strong>Genres:</strong> ${properties.genres.join(', ')}<br/>`;
	}

	buffer += `<strong>Synopsis:</strong> ${properties.synopsis}`;

	return buffer;
});

const videogames = new InfoBox(igdbRequest, properties => {
	let buffer = '';

	const date = new Date(properties.first_release_date * 1000);
	buffer += `<strong>Released:</strong> ${leftpad(date.getDate())}-${leftpad(date.getMonth() + 1)}-${leftpad(date.getFullYear())}<br/>`;
	if (properties.rating) {
		const scoreColor = properties.rating > 70 ? 'green' : properties.score < 55 ? 'red' : 'orange';
		buffer += `<strong>Rating:  <span style="color: ${scoreColor}">${properties.rating.toFixed(1)}%</span></strong> from ${properties.rating_count} ratings. | `;
	}
	buffer += `<strong>Popularity:</strong> ${properties.popularity.toFixed(1)}%<br/>`;
	if (properties.summary) {
		if (properties.summary.length > 600) {
			buffer += `<details style="width:100%;"><summary style="font-weight:bold;">Summary:</summary><div style="max-height:200px;">${properties.summary}</div></details>`;
		} else {
			buffer += `<strong>Summary:</strong> ${properties.summary}`;
		}
	}

	return buffer;
});

module.exports = {
	commands: {
		anime: {
			permission: 1,
			disallowPM: true,
			async action(message) {
				if (this.room !== 'animeandmanga' && !this.canUse(2)) return this.pmreply("Permission denied.");
				if (!message) return this.reply("No query entered.");

				const html = await anime.parse(message).catch(err => this.reply(`Something went wrong during the request: ${err}`));
				if (!html) return;

				return this.replyHTML(html);
			},
		},
		manga: {
			permission: 1,
			disallowPM: true,
			async action(message) {
				if (this.room !== 'animeandmanga' && !this.canUse(2)) return this.pmreply("Permission denied.");
				if (!message) return this.reply("No query entered.");

				const html = await manga.parse(message).catch(err => console.log(`Something went wrong during the request: ${err}`));
				if (!html) return;

				return this.replyHTML(html);
			},
		},
		game: {
			permission: 1,
			disallowPM: true,
			async action(message) {
				if (this.room !== 'videogames' && !this.canUse(2)) return this.pmreply("Permission denied.");
				if (!message) return this.reply("No query entered.");

				const html = await videogames.parse(message).catch(err => this.reply(`Something went wrong during the request: ${err}`));
				if (!html) return;

				return this.replyHTML(html);
			},
		},
	},
};
