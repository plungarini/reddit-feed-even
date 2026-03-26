/**
 * Reddit Client — Backend Proxy Server
 *
 * Proxies all requests to Reddit API with cookie-based auth.
 */

import cors from 'cors';
import express from 'express';

const app = express();
const PORT = Number(process.env.SERVER_PORT ?? 3001);

app.use(cors());
app.use(express.json());

// ─── Request logging ─────────────────────────────────────────────────────────

app.use((req, _res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
	next();
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
	res.json({ ok: true, timestamp: Date.now() });
});

// ─── Auth test endpoint (MUST be before /api/reddit wildcard) ─────────────────

app.get('/api/test-auth', async (req: express.Request, res: express.Response) => {
	try {
		const token = req.headers['x-reddit-token'] as string | undefined;
		const session = req.headers['x-reddit-session'] as string | undefined;

		const cookies: string[] = [];
		if (token) cookies.push(`token_v2=${token}`);
		if (session) cookies.push(`reddit_session=${session}`);

		const headers: Record<string, string> = {
			'User-Agent': (req.headers['x-reddit-user-agent'] as string) || 'reddit-client-even/1.0',
			Accept: 'application/json',
		};
		if (cookies.length > 0) {
			headers['Cookie'] = cookies.join('; ');
		}

		console.log('[Proxy] Testing auth with /api/me.json...');
		console.log('[Proxy] Cookie header:', headers['Cookie'] ? headers['Cookie'].substring(0, 50) + '...' : 'none');

		const response = await fetch('https://www.reddit.com/api/me.json', {
			headers,
			redirect: 'manual', // Don't follow redirects
		});

		console.log('[Proxy] Auth test status:', response.status, response.statusText);
		console.log('[Proxy] Auth test content-type:', response.headers.get('content-type'));

		// Get response body as text first
		const text = await response.text();
		console.log('[Proxy] Auth test body (first 300 chars):', text.slice(0, 300));

		// Check if it's a redirect (305 or 302)
		if (response.status === 305 || response.status === 302 || response.status === 301) {
			const location = response.headers.get('location');
			console.log('[Proxy] Auth test got redirect to:', location);
			res.json({
				status: response.status,
				authenticated: false,
				username: null,
				error: `Redirect to: ${location}`,
			});
			return;
		}

		// Try to parse as JSON
		let data;
		try {
			data = JSON.parse(text);
		} catch (e) {
			console.log('[Proxy] Auth test JSON parse failed');
			res.json({
				status: response.status,
				authenticated: false,
				username: null,
				error: 'Not valid JSON response',
				bodyPreview: text.slice(0, 200),
			});
			return;
		}

		console.log('[Proxy] Auth test data keys:', Object.keys(data));
		console.log('[Proxy] Auth test data.name:', data.name);
		console.log('[Proxy] Auth test data.data:', data.data ? JSON.stringify(data.data).slice(0, 100) : 'undefined');

		// Reddit /api/me.json returns { name: 'username', ... } directly in some cases
		// or { data: { name: 'username', ... } } in others
		const username = data.name || data.data?.name || null;

		res.json({
			status: response.status,
			authenticated: !!username,
			username: username,
			rawKeys: Object.keys(data),
			error: data.error || null,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[Proxy] Auth test error:', message);
		res.status(500).json({ error: message });
	}
});

// ─── Reddit API proxy ─────────────────────────────────────────────────────────

app.use('/api/reddit', async (req: express.Request, res: express.Response) => {
	try {
		const redditUrl = new URL(`https://www.reddit.com${req.path}`);

		// Forward all query params
		for (const [k, v] of Object.entries(req.query)) {
			redditUrl.searchParams.set(k, String(v));
		}

		// Get auth tokens from headers
		const token = req.headers['x-reddit-token'] as string | undefined;
		const session = req.headers['x-reddit-session'] as string | undefined;
		const ua = (req.headers['x-reddit-user-agent'] as string) || 'reddit-client-even/1.0';

		// Build cookie string
		const cookies: string[] = [];
		if (token) cookies.push(`token_v2=${token}`);
		if (session) cookies.push(`reddit_session=${session}`);

		const headers: Record<string, string> = {
			'User-Agent': ua,
			Accept: 'application/json',
		};
		if (cookies.length > 0) {
			headers['Cookie'] = cookies.join('; ');
		}

		console.log(`[Proxy] → ${redditUrl} ${token ? '(with auth)' : '(no auth)'}`);

		const response = await fetch(redditUrl.toString(), {
			headers,
			redirect: 'follow',
		});

		if (!response.ok) {
			const body = await response.text();
			console.error(`[Proxy] Reddit returned ${response.status}: ${body.slice(0, 200)}`);
			res.status(response.status).json({
				error: `Reddit API error: ${response.status}`,
			});
			return;
		}

		const text = await response.text();
		res.status(200).set('Content-Type', 'application/json').send(text);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[Proxy] Error:', message);
		res.status(500).json({ error: message });
	}
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
	console.log(`[Server] Reddit proxy running on http://0.0.0.0:${PORT}`);
	console.log(`[Server] Routes: /api/health | /api/test-auth | /api/reddit/*`);
});
