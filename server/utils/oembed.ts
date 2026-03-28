export const OEMBED_PROVIDERS: Record<string, (url: string) => string> = {
	// Video
	'youtube.com': (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
	'youtu.be': (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
	'vimeo.com': (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
	'dailymotion.com': (u) => `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(u)}`,
	'dai.ly': (u) => `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(u)}`,
	'tiktok.com': (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
	'ted.com': (u) => `https://www.ted.com/services/v1/oembed.json?url=${encodeURIComponent(u)}`,

	// Audio
	'soundcloud.com': (u) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}`,
	'spotify.com': (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`,
	'mixcloud.com': (u) => `https://www.mixcloud.com/oembed/?format=json&url=${encodeURIComponent(u)}`,

	// Images / Media
	'flickr.com': (u) => `https://www.flickr.com/services/oembed/?format=json&url=${encodeURIComponent(u)}`,
	'flic.kr': (u) => `https://www.flickr.com/services/oembed/?format=json&url=${encodeURIComponent(u)}`,
	'imgur.com': (u) => `https://api.imgur.com/oembed.json?url=${encodeURIComponent(u)}`,
	'giphy.com': (u) => `https://giphy.com/services/oembed?url=${encodeURIComponent(u)}`,

	// Social / Content
	'twitter.com': (u) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(u)}`,
	'x.com': (u) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(u)}`,
	'tumblr.com': (u) => `https://www.tumblr.com/oembed/1.0?url=${encodeURIComponent(u)}`,
	'reddit.com': (u) => `https://www.reddit.com/oembed?url=${encodeURIComponent(u)}`,
	'redd.it': (u) => `https://www.reddit.com/oembed?url=${encodeURIComponent(u)}`,
	'codepen.io': (u) => `https://codepen.io/api/oembed?url=${encodeURIComponent(u)}&format=json`,
	'kickstarter.com': (u) => `https://www.kickstarter.com/services/oembed?url=${encodeURIComponent(u)}`,
	'issuu.com': (u) => `https://issuu.com/oembed?url=${encodeURIComponent(u)}&format=json`,
};
