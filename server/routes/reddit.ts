import { Hono } from 'hono';

const router = new Hono();
const FORWARDED_HEADERS = ['content-type', 'retry-after', 'x-ratelimit-used', 'x-ratelimit-remaining', 'x-ratelimit-reset'];

function buildProxyHeaders(response: Response): Headers {
	const headers = new Headers();

	for (const headerName of FORWARDED_HEADERS) {
		const value = response.headers.get(headerName);
		if (value) headers.set(headerName, value);
	}

	return headers;
}

// ─── Auth test endpoint ─────────────────
router.get('/test-auth', async (c) => {
	try {
		const token = c.req.header('x-reddit-token');
		const session = c.req.header('x-reddit-session');

		const cookies: string[] = [];
		if (token) cookies.push(`token_v2=${token}`);
		if (session) cookies.push(`reddit_session=${session}`);

		const headers: Record<string, string> = {
			'User-Agent': c.req.header('x-reddit-user-agent') || 'reddit-feed-even/1.0',
			Accept: 'application/json',
		};
		if (cookies.length > 0) {
			headers['Cookie'] = cookies.join('; ');
		}

		const response = await fetch('https://www.reddit.com/api/me.json', {
			headers,
			redirect: 'manual',
		});

		const text = await response.text();

		if (response.status === 305 || response.status === 302 || response.status === 301) {
			return c.json({
				status: response.status,
				authenticated: false,
				username: null,
				error: `Redirect to: ${response.headers.get('location')}`,
			});
		}

		let data;
		try {
			data = JSON.parse(text);
		} catch (e) {
			return c.json({
				status: response.status,
				authenticated: false,
				username: null,
				error: 'Not valid JSON response',
				bodyPreview: text.slice(0, 200),
			});
		}

		const username = data.name || data.data?.name || null;
		return c.json({
			status: response.status,
			authenticated: !!username,
			username: username,
			rawKeys: Object.keys(data),
			error: data.error || null,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ error: message }, 500);
	}
});

// ─── Reddit API proxy ───────────────────
router.all('/:proxyPath{.+}', async (c) => {
	try {
		const path = c.req.param('proxyPath');
		const redditUrl = new URL(`https://www.reddit.com/${path}`);
		const query = c.req.query();
		for (const [k, v] of Object.entries(query)) {
			redditUrl.searchParams.set(k, String(v));
		}

		const token = c.req.header('x-reddit-token');
		const session = c.req.header('x-reddit-session');
		const ua = c.req.header('x-reddit-user-agent') || 'reddit-feed-even/1.0';

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

		const response = await fetch(redditUrl.toString(), {
			headers,
			redirect: 'follow',
		});

		const proxyHeaders = buildProxyHeaders(response);

		if (!response.ok) {
			const error = await response.text();
			console.error(
				`[Proxy] Reddit API error: ${response.status} retry-after=${response.headers.get('retry-after')} reset=${response.headers.get('x-ratelimit-reset')}`,
				error,
			);
			return new Response(error || JSON.stringify({ error: `Reddit API error: ${response.status}` }), {
				status: response.status,
				statusText: response.statusText,
				headers: proxyHeaders,
			});
		}

		const text = await response.text();
		return new Response(text, {
			status: response.status,
			statusText: response.statusText,
			headers: proxyHeaders,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ error: message }, 500);
	}
});

export default router;
