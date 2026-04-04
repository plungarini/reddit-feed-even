/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { PeekalinkRedirectLoopError, preview as previewModes } from '../features/preview';
import { PreviewData } from '../types/preview';
import { CACHE_CONFIG, clampTtl, generateCacheKey, getCacheTtlFromRequest } from '../utils/cache';

const router = new Hono();

// ─── Helper: Store response in cache with TTL ────────────────────────────────
async function cacheResponse(cache: Cache, cacheKey: Request, response: Response, ttlSeconds: number): Promise<void> {
	const clampedTtl = clampTtl(ttlSeconds);

	// Create a new response with Cache-Control header for TTL
	const responseToCache = new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			...Object.fromEntries(response.headers.entries()),
			'Cache-Control': `max-age=${clampedTtl}`,
			Date: new Date().toUTCString(),
		},
	});

	await cache.put(cacheKey, responseToCache);
}

// ─── Full Preview endpoint ──────────────────────────────────────────
router.get('/', async (c) => {
	const url = c.req.query('url');
	if (!url) return c.json({ error: 'Missing url parameter' }, 400);

	const cache = (caches as unknown as { default: Cache }).default;
	const cacheKey = generateCacheKey(url, 'preview');

	// Get TTL (client can override via header, otherwise use default)
	const ttlSeconds = getCacheTtlFromRequest(c.req.raw);

	// Check cache first
	const cached = await cache.match(cacheKey);
	if (cached) {
		const dateHeader = cached.headers.get('date');
		const isValid = dateHeader ? (Date.now() - new Date(dateHeader).getTime()) / 1000 < ttlSeconds : true;

		if (isValid) {
			return cached;
		}
	}

	try {

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
			image: preview?.image,
			url,
		};


		const response = c.json(data);

		// Cache the successful response with configured TTL
		c.executionCtx.waitUntil(cacheResponse(cache, cacheKey, response.clone(), ttlSeconds));

		return response;
	} catch (err) {
		if (err instanceof PeekalinkRedirectLoopError) {
			const errorResponse = c.json({ url: url, error: 'Link redirects to itself' }, 400);
			c.executionCtx.waitUntil(cacheResponse(cache, cacheKey, errorResponse.clone(), CACHE_CONFIG.DEFAULT_TTL_SECONDS));
			return errorResponse;
		}

		const message = err instanceof Error ? err.message : String(err);
		console.error(`[Preview] Error for ${url}:`, message);
		return c.json({ error: message }, 500);
	}
});

export default router;
