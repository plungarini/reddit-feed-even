// Environment Variables Template
// Copy your Reddit auth details here or run: node scripts/setup-env.js

globalThis.__REDDIT_CLIENT_ENV__ = {
	// Get from: reddit.com → DevTools → Application → Cookies → token_v2
	REDDIT_TOKEN_V2: '',

	// Optional: Custom user agent
	REDDIT_USER_AGENT: 'reddit-feed-even/1.0',

	// Default Backend Proxy URL (Hono on Cloudflare Workers)
	REDDIT_PROXY_URL: 'https://reddit-feed-even.plungarini.workers.dev/',
};
