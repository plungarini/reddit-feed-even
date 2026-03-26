import { Router } from 'express';

const router = Router();

// ─── Auth test endpoint ─────────────────
router.get('/test-auth', async (req, res) => {
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
		const response = await fetch('https://www.reddit.com/api/me.json', {
			headers,
			redirect: 'manual',
		});

		const text = await response.text();
		
		if (response.status === 305 || response.status === 302 || response.status === 301) {
			res.json({
				status: response.status,
				authenticated: false,
				username: null,
				error: `Redirect to: ${response.headers.get('location')}`,
			});
			return;
		}

		let data;
		try {
			data = JSON.parse(text);
		} catch (e) {
			res.json({
				status: response.status,
				authenticated: false,
				username: null,
				error: 'Not valid JSON response',
				bodyPreview: text.slice(0, 200),
			});
			return;
		}

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
		res.status(500).json({ error: message });
	}
});

// ─── Reddit API proxy ───────────────────
router.use('/reddit', async (req, res) => {
	try {
		const redditUrl = new URL(`https://www.reddit.com${req.path}`);
		for (const [k, v] of Object.entries(req.query)) {
			redditUrl.searchParams.set(k, String(v));
		}

		const token = req.headers['x-reddit-token'] as string | undefined;
		const session = req.headers['x-reddit-session'] as string | undefined;
		const ua = (req.headers['x-reddit-user-agent'] as string) || 'reddit-client-even/1.0';

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
			res.status(response.status).json({
				error: `Reddit API error: ${response.status}`,
			});
			return;
		}

		const text = await response.text();
		res.status(200).set('Content-Type', 'application/json').send(text);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		res.status(500).json({ error: message });
	}
});

export default router;
