'use strict';

const Promise = require('bluebird');
const FurryMap = require('./index');

require('assert')(process.env.SEARCH, 'Needs search param for test');
const options = {};
if (process.env.USERNAME && process.env.PASSWORD) {
	options.credentials = {
		username: process.env.USERNAME,
		password: process.env.PASSWORD
	};
}
const client = new FurryMap(options);
Promise.all([
	client.loadMarkers(true),
	client.getProfile(process.env.SEARCH),
	client.search(process.env.SEARCH)
])
.then(data => {
	console.log('Marker count:', data.shift().length);
	console.log(JSON.stringify(data, null, '\t'));
}, error => console.error(error.stack));
