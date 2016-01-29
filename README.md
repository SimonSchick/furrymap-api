# furrymap-api
Simple furrymap client.

Right now this only allows fetching data from the website.

For simple example usage, please see the test folder and the source, it's fully documented :).

## constructor(Object settings)
```
All settings:
```javascript
{
	cacheName: string = furrymapCache.json
}
```

##Promise.<{users: FurrymapProfile[], markers: FurrymapMarker[]}> FurryMap.search(searchString: string, filter: string)
Performs a search for markers and/or users.

##Promise.<FurrymapFullProfile> FurryMap.getProfile(userName: string)
Fetches a full profile.

##Promise.<FurrymapMarker2[]> FurryMap.loadMarkers(forceRefresh: boolean)
Downloads the marker data(all markers) and caches them.
