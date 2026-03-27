/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { preview as previewModes } from '../features/preview';
import { PreviewData } from '../types/preview';

const router = new Hono();

// ─── Link Preview endpoint ────────────────
router.get('/v1', async (c) => {
	const url = c.req.query('url');
	if (!url) return c.json({ error: 'Missing url parameter' }, 400);

	try {
		console.log(`[Proxy] Fetching preview (fast) for: ${url}`);

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; RedditClientEven/1.0; +https://plungarini.github.io)',
				Accept: 'text/html',
				Range: 'bytes=0-51200',
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(5000),
		});

		// 206 is "Partial Content" (expected if the server respected our Range header)
		if (!response.ok && response.status !== 206) {
			throw new Error(`Target status: ${response.status}`);
		}

		let ogTitle = '';
		let htmlTitle = '';
		let desc = '';
		let img = '';

		const rewriter = new HTMLRewriter()
			.on('meta', {
				element(e) {
					// Look for both 'name' (standard) and 'property' (Open Graph)
					const name = (e.getAttribute('name') || e.getAttribute('property'))?.toLowerCase();
					const content = e.getAttribute('content');

					if (!name || !content) return;

					if (name === 'og:title' || name === 'twitter:title') ogTitle = content;
					if (name === 'description' || name === 'og:description' || name === 'twitter:description') {
						desc = desc || content; // Keep the first one we find
					}
					if (name === 'og:image' || name === 'twitter:image') img = img || content;
				},
			})
			.on('title', {
				text(t) {
					htmlTitle += t.text;
				},
			});

		const transformed = rewriter.transform(response);

		if (transformed.body) {
			const reader = transformed.body.getReader();
			let bytesRead = 0;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				bytesRead += value.byteLength;
				if (bytesRead > 51200) {
					await reader.cancel();
					break;
				}
			}
		}

		let finalTitle = ogTitle || htmlTitle || undefined;

		finalTitle = finalTitle?.replaceAll(/\s+/g, ' ').trim();

		const data = {
			title: finalTitle,
			description: desc.replaceAll(/\s+/g, ' ').trim(),
			image: img,
			url: url,
		};

		console.log(`[Proxy] Preview success:`, data.title);
		return c.json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[Proxy] Preview error for ${url}:`, message);
		return c.json({ error: message }, 500);
	}
});

router.get('/', async (c) => {
	const url = c.req.query('url');
	if (!url) return c.json({ error: 'Missing url parameter' }, 400);

	const cache = (caches as unknown as { default: Cache }).default;
	const cacheKey = new Request(`https://preview-cache/${encodeURIComponent(url)}`);
	const cached = await cache.match(cacheKey);
	if (cached) {
		console.log(`[Preview] Cache hit: ${url}`);
		return cached;
	}

	try {
		console.log(`[Preview] Fetching: ${url}`);

		const preview =
			(await previewModes.fetchViaLinkpreviewnet(url)) ??
			(await previewModes.fetchViaMicrolink(url)) ??
			(await previewModes.fetchViaPeekalink(url)) ??
			(await previewModes.fetchViaScrape(url)) ??
			(await previewModes.fetchViaOembed(url));

		const data: PreviewData = {
			method: preview?.method || 'failed',
			title: preview?.title?.slice(0, 200),
			description: preview?.description?.slice(0, 500),
			url,
		};

		console.log(`[Preview] Done with "${preview?.method}": ${data.title}`);

		const response = c.json(data);

		c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

		return response;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[Preview] Error for ${url}:`, message);
		return c.json({ error: message }, 500);
	}
});

export default router;
