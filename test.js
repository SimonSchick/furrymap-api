'use strict';

const Promise = require('bluebird');
const FurryMap = require('./index');
const client = new FurryMap();
Promise.all([
	client.loadMarkers(),
	client.getProfile('Doridian'),
	client.search('Doridian')
])
.then(data => {
	console.log(data);
}, error => console.error(error.stack));
