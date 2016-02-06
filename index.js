'use strict';

const Promise = require('bluebird');
const request = Promise.promisify(require('request').defaults({
	baseUrl: 'https://furrymap.net'
}));
const fs = Promise.promisifyAll(require('fs'));
const cheerio = require('cheerio');
const whichCountry = require('which-country');
const url = require('url');

/**
 * FurryMap client api.
 */
module.exports = class FurryMap {
	/**
	 * @param {Object} config The config object.
	 * @param {string} [config.cacheName='furrymapCache.json'] The file to store the markers in.
	 * @param {!Object} [config.credentials] Contains credentials, optional.
	 * @param {string} [config.credentials.username] Username to use.
	 * @param {string} [config.credentials.password] Password to use.
	 */
	constructor(config) {
		this.config = Object.assign({
			cacheName: 'furrymapCache.json'
		}, config);
		this.jar = request.jar();
	}

	/**
	 * Returns whether the client is authenticated yet.
	 * @private
	 * @return {Boolean} Is authenticated.
	 */
	isAuthenticated() {
		return this.authPromise && this.authPromise.isFulfilled();
	}



	/**
	 * Loads HTML into a cheerio object.
	 * @private
	 * @param  {RequestOptions} requestOptions The request options.
	 * @param {boolean} skipAuth Skips authentication.
	 * @return {Promise.<Cheerio>} Resolves a cheerio object.
	 */
	loadHTML(requestOptions, skipAuth) {
		if (typeof requestOptions === 'string') {
			requestOptions = {
				url: requestOptions
			};
		}
		const returnPromise = !this.isAuthenticated() && !skipAuth ? this.authenticate() : Promise.resolve();
		return returnPromise.then(() =>
			request(Object.assign({
				jar: this.jar
			}, requestOptions))
		)
		.get('body')
		.then(cheerio.load);
	}

	/**
	 * Performs the login.
	 * @private
	 * @return {Promise} Resolves on success.
	 */
	doLogin() {
		const cred = this.config.credentials;
		return this.loadHTML('/en/login', true)
		.then($ => this.loadHTML({
			url: '/en/login',
			method: 'POST',
			form: {
				'signin[username]': cred.username,
				'signin[password]': cred.password,
				'signin[remember]': 'on',
				'signin[_csrf_token]': $('#signin__csrf_token').val()
			}
		}, true))
		.then($ => {
			if ($('#login_form > .error_list').length) {
				throw new Error('Invalid login');
			}
		});
	}

	/**
	 * Authenticates the client.
	 * @private
	 * Internally the client fetches a cookie and csrf token to use the search.
	 * @return {Promise} Resolves when the auth succeeded.
	 */
	authenticate() {
		if (this.authPromise && this.authPromise.isPending()) {
			return this.authPromise;
		}
		const retPromise = this.config.credentials ? this.doLogin() : Promise.resolve();
		this.authPromise = retPromise.then(() => this.loadHTML({
			url: '/en/search/'
		}, true))
		.then($ => {
			this.csrf = $('#namefinder__csrf_token').val();
		});
		return this.authPromise;
	}

	/**
	 * @typedef {FurrymapProfile} Object
	 * @property {integer} id The user id.
	 * @property {string} profileURL The url to the users profile.
	 * @property {!string} avatarURL The url of the avatar.
	 * @property {string} gender The gender of the user.
	 * @property {string} country The country of the user.
	 * @property {!string} species The species of the user.
	 * @property {integer} markerCount The amount of markers the user has.
	 */

	/**
	 * @external {Cheerio} https://github.com/cheeriojs/cheerio/blob/master/lib/cheerio.js
	 * @external {CheerioElement} https://github.com/cheeriojs/cheerio/blob/master/lib/cheerio.js
	 */

	/**
	 * Fetches the profile list from the search result html.
	 * @private
	 * @param  {Cheerio} $ The cheerio object containing the html.
	 * @return {FurrymapProfile[]} The parsed profiles.
	 */
	fetchSearchProfiles($) {
		return $('div[id^=userlocation_] > div')
		.map((idx, el) => $(el))
		.toArray()
		.map(container => {
			const userLink = $(container.find('a[id^=user_]').get(0));
			const id = parseInt(userLink.attr('id').match(/^user_(\d+)$/i)[1], 10);
			const speciesAndMarker = this.getPureText($(container.find('small:last-child').get(0)))
			.match(/^(?:(.*?),)?\s*(\d+) markers?$/i);

			return {
				id,
				name: userLink.text().trim(),
				profileURL: $(container.find('a').get(0)).attr('href'),
				avatarURL: `/images/avatar/${id}.png`,
				gender: $(container.find('a + img').get(0)).attr('alt'),
				country: $(container.find('small > span > img').get(0)).attr('title'),
				species: speciesAndMarker[1],
				markerCount: parseInt(speciesAndMarker[2], 10)
			};
		});
	}

	/**
	 * @typedef {Object} Location
	 * @property {float} longitude The longitude of the location.
	 * @property {float} latitude The latitude of the location.
	 * @property {string} country The country of the location.
	 * @property {!float} location.height The height of the location.
	 */

	/**
	 * @typedef {Object} FurrymapMarker
	 * @property {integer} id The marker id.
	 * @property {boolean} isHome Is the marker the users home.
	 * @property {string} userName The name of the owner of the marker.
	 * @property {string} description The description of the marker.
	 * @property {Location} location Location of the user.
	 */

	/**
	 * Fetches the marker list from the search result html.
	 * @private
	 * @param  {Cheerio} $ The cheerio object containing the html.
	 * @return {FurrymapMarker[]} The parsed profiles.
	 */

	fetchSearchMarkers($) {
		return $('#markersitems > div')
		.map((idx, el) => $(el))
		.toArray()
		.map(container => {
			const id = container.attr('id').match(/^marker_(\d+)$/i)[1];
			const inner = $(container.find('div').get(0));
			const mapsQuery = url.parse($(inner.find('small > a').get(0)).attr('href'), true).query;
			const longLat = mapsQuery.daddr.split(',');
			const longitude = parseFloat(longLat[1]);
			const latitude = parseFloat(longLat[0]);
			return {
				id,
				isHome: Boolean(inner.find('small > img[src="/images/home.png"]').get(0)),
				userName: $(inner.find('b > a').get(0)).text().trim(),
				description: this.getPureText($(inner.find('b').get(0))).replace(/:\s+/ig, ''),
				location: {
					longitude,
					latitude,
					country: whichCountry([longitude, latitude]),
					height: parseFloat(mapsQuery.z)
				}
			};
		});
	}

	/**
	 * @external {RequestOptions} https://github.com/request/request#requestoptions-callback
	 */

	/**
	 * Performs a search for username and/or users and markers.
	 * @public
	 * @param  {string} name The search string.
	 * @param  {!string} filter Can be "furries" or "markers", leave blank for both.
	 * @return {Promise.<{users: FurrymapProfile[], markers: FurrymapMarker[]}>} Resolves the search results.
	 */
	search(name, filter) {
		let returnPromise = Promise.resolve();
		if (!this.isAuthenticated()) {
			returnPromise = this.authenticate();
		}
		return returnPromise.then(() =>
			this.loadHTML({
				url: '/en/search/',
				method: 'post',
				form: {
					'namefinder[search]': name,
					'namefinder[showhidden]': filter || '',
					'namefinder[_csrf_token]': this.csrf
				}
			})
		)
		.then($ =>
			({
				users: this.fetchSearchProfiles($),
				markers: this.fetchSearchMarkers($)
			})
		);
	}

	/**
	 * @typedef {Object} FurrymapFullProfile
	 * @property {Object} about General info.
	 * @property {!string} about.otherNickNames Other nicknames of the user.
	 * @property {!string} about.relationShipStatus May be in *any* language.
	 * @property {!string} about.species The species of the user.
	 * @property {Object} contact User contact info.
	 * @property {!string} contact.realName The real name of the user.
	 * @property {!Date} contact.birthDate May be unprecise if only the age is exposed.
	 * @property {!Object} contact.location Some more location infos.
	 * @property {!string[]} contact.location Additional location info.
	 * @property {Object} contact.phones Phone numbers.
	 * @property {!string} contact.phones.mobile Cell number.
	 * @property {!string} contact.phones.home Home number.
	 * @property {!Object.<string>} messengers List of messengers.
	 * @property {!Object.<string>} websites List of websites.
	 * @property {FurrymapMarkers[]} markers The makers.
	 * @property {FurrymapProfile[]} friends The friends of this user.
	 */

	/**
	 * Gets the text content, ignoring the text of all child nodes.
	 * @private
	 * @param  {CheerioElement} element The element to get the text from.
	 * @return {string} Text.
	 */
	getPureText(element) {
		return element
		.clone()
		.children()
		.remove()
		.end()
		.text()
		.trim();
	}

	/**
	 * Fetches the profile info for a user by name.
	 * @public
	 * @param {string} userName The use to fetch.
	 * @return {Promise.<FurrymapFullProfile>} Resolves a full profile.
	 */
	getProfile(userName) {
		return this.loadHTML({
			url: `/profile/${userName}`
		})
		.then($ => {
			const container = $('#middle_content');
			//Note: getting 1 instead of zero is a HACK to bypass a bug in cheerio!!!!
			const fetch = (selector, hack) => this.getPureText($(container.find(selector).get(hack ? 1 : 0)));

			const fetchContains = (text, hack) => fetch(`div > div:contains("${text}")`, hack); //eslint-disable-line

			const fetchAssoc = (text, useTextAsValue) => { //eslint-disable-line
				const ret = {};

				container.find(`h3:contains(${text}) + div > div`)
				.each((idx, el) => {
					const curr = $(el);
					const valueElement = $(curr.find('a').get(0));
					const value = useTextAsValue ? valueElement.text() : valueElement.attr('href');
					const key = $(curr.find('b').get(0)).text().replace(': ', '').toLowerCase();
					if (value.includes(key)) {
						(ret.misc = ret.misc || []).push(value);
						return;
					}
					ret[key] = value;
				});
				return ret;
			};

			const birthdayString = fetchContains('Birthday', true);
			const age = parseInt(fetchContains('Age', true), 10);
			let birthDate;
			if (birthdayString) {
				birthDate = new Date(birthdayString);
			} else if (age) {
				birthDate = new Date();
				birthDate.setUTCYear(birthDate.getUTCYear() - age);
			}

			const locationString = fetch('div:not(:has(*))');
			let location;
			if (locationString) {
				const split = locationString.split(',');
				location = split.map(str => str.trim());
			}

			const messengers = fetchAssoc('Messenger', true);
			const websites = fetchAssoc('Websites');
			return {
				about: Boolean(container.find('About me')) ? {
					otherNicknames: fetchContains('Other nicknames:', true),
					relationShipStatus: fetchContains('Relationship status', true),
					species: fetchContains('Furry species', true)
				} : null,
				contact: Boolean(container.find('h3:contains("Reallife")')) ? {
					realName: fetchContains('Realname:', true),
					birthDate: birthDate || null,
					location: location || null,
					phones: {
						mobile: fetchContains('Cell number', true),
						home: fetchContains('Home number', true)
					}
				} : null,
				messengers: Boolean(container.find('h3:contains("Messenger")')) ? messengers : null,
				websites: Boolean(container.find('h3:contains("Websites")')) ? websites : null,
				markers: this.fetchSearchMarkers($),
				friends: this.fetchSearchProfiles($)
			};
		});
	}

	/**
	 * @typedef {FurrymapMarker2} Object
	 * @property {integer} id The marker id.
	 * @property {string} userName The name of the owner of the marker.
	 * @property {string} description The description of the marker.
	 * @property {integer} opacityFactor Some factor that is related to how icons are rendered when zooming.
	 * @property {Location} location Location of the user.
	 * @property {string} profileURL The link to the users profile.
	 * @property {string} profileImageURL The link to the users avatar.
	 */

	/**
	 * Fetches the markers from the website.
	 * @private
	 * @return {Promise.<FurrymapMarker2[]>} Resolves the marker data.
	 */
	loadMarkersInternal() {
		return request({
			url: 'en/marker/list/type/combined',
			//json: true, cannot send this as this make the server 500
			headers: {
				'User-Agent': 'curl/7.43.0'
			}
		})
		.then(response =>
			JSON.parse(response.body).combined.geojson.features
			.map(entry => ({
				id: entry[2],
				userName: entry[5],
				description: entry[3],
				opacityFactor: entry[4],
				location: {
					longitude: entry[0],
					latitude: entry[1],
					country: whichCountry([entry[0], entry[1]])
				},
				profileURL: `${entry[6]}`,
				profileImageURL: entry[7] === 0 ? undefined : `/images/avatar/${entry[7]}.png`
			}))
		)
		.then(data =>
			fs.writeFileAsync(this.config.cacheName, JSON.stringify(data))
			.return(data)
		);
	}

	/**
	 * Fetches the markers from the website.
	 * @public
	 * @param {boolean} [forceDownload=false] When true, the cache will be bypassed and the makers will be reloaded.
	 * @return {Promise.<FurrymapMarker2[]>} Resolves the marker data.
	 */
	loadMarkers(forceDownload) {
		if (!forceDownload) {
			return fs.statAsync(this.config.cacheName)
			.then(() => fs.readFileAsync(this.config.cacheName))
			.then(JSON.parse)
			.catch(() => this.loadMarkersInternal());
		}
		return this.loadMarkersInternal();
	}
};
