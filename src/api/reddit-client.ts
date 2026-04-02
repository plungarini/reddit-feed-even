/**
 * Reddit API Client
 *
 * Proxies all requests through the local Express server (server/index.ts)
 * which sets Cookie headers server-side — the browser Fetch API cannot.
 */

import { ApiConfig, FeedConfig, RedditClientInterface, RedditComment, RedditListing, RedditPost } from '../core/types';
import { MAX_UPGRADE_LENGTH } from '../shared/constants';
import { clamp } from '../shared/utils';
import { AuthManager } from './auth-manager';
import { RateLimiter } from './rate-limiter';

export class RedditRateLimitError extends Error {
	readonly retryAfterSeconds: number;

	constructor(retryAfterSeconds: number) {
		super(`Reddit API rate limit hit. Retry in ${retryAfterSeconds}s.`);
		this.name = 'RedditRateLimitError';
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

export class RedditClient implements RedditClientInterface {
	private readonly auth: AuthManager;
	private readonly rateLimiter: RateLimiter;
	private readonly apiConfig: ApiConfig;

	constructor(auth: AuthManager, rateLimiter: RateLimiter, apiConfig: ApiConfig) {
		this.auth = auth;
		this.rateLimiter = rateLimiter;
		this.apiConfig = apiConfig;
	}

	async initialize(): Promise<void> {
		await this.auth.initialize();
	}

	// ========================================================================
	// HTTP helpers
	// ========================================================================

	private proxyHeaders(): Record<string, string> {
		// Use auth.buildHeaders() which properly constructs Cookie header
		const headers = this.auth.buildHeaders({ Accept: 'application/json' });

		// Also send X-Reddit-Token and X-Reddit-Session for the proxy to convert to Cookie
		const config = this.auth.getConfig();
		if (config.tokenV2) {
			headers['X-Reddit-Token'] = config.tokenV2;
			console.log('[RedditClient] Using token_v2 for auth');
		} else {
			console.log('[RedditClient] No token_v2, using public feed');
		}
		if (config.session) {
			headers['X-Reddit-Session'] = config.session;
			console.log('[RedditClient] Using reddit_session for auth');
		}
		if (config.userAgent) headers['X-Reddit-User-Agent'] = config.userAgent;

		return headers;
	}

	private async get<T>(path: string, params: Record<string, string> = {}, isRetry = false): Promise<T> {
		await this.rateLimiter.throttle();

		const url = new URL(`${this.baseUrl}${path}`);
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) url.searchParams.set(key, value);
		}

		console.log(`[RedditClient] GET ${url.toString()} (retry=${isRetry})`);

		let response: Response;
		try {
			response = await fetch(url.toString(), {
				headers: this.proxyHeaders(),
				signal: AbortSignal.timeout(30_000),
			});
		} catch (err) {
			const name = err instanceof Error ? err.name : '';
			const errorDetails = err instanceof Error ? err : new Error(String(err));
			if (name === 'TimeoutError' || name === 'AbortError') {
				console.error('[RedditClient] Request timeout:', url.toString(), errorDetails);
				throw new Error(`Request timed out (30s). URL: ${url.pathname}`);
			}
			console.error('[RedditClient] Network error:', url.toString(), errorDetails);
			throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
		}

		this.rateLimiter.updateFromHeaders(response.headers);

		if (!response.ok) {
			// Clone response for potential error logging before we retry or throw
			const responseClone = response.clone();
			
			if (response.status === 429) {
				const resetSeconds = getRetryDelaySeconds(response.headers, this.rateLimiter.getState().resetSeconds || 60);
				console.warn(`[RedditClient] 429 Rate Limit. Retry in ${resetSeconds}s.`);
				throw new RedditRateLimitError(resetSeconds);
			}

			if (response.status === 401 || response.status === 403) {
				const err = new Error(`Authentication failed (${response.status}). Check Reddit tokens.`);
				console.error('[RedditClient] Auth error response:', responseClone);
				throw err;
			}
			
			// Log detailed error before throwing
			const errorMsg = `Reddit API error: ${response.status} ${response.statusText}`;
			console.error('[RedditClient] Error response:', responseClone);
			throw new Error(errorMsg);
		}

		return response.json() as T;
	}

	private get baseUrl(): string {
		const base = this.apiConfig.baseUrl.endsWith('/') ? this.apiConfig.baseUrl.slice(0, -1) : this.apiConfig.baseUrl;
		return `${base}/api/reddit`;
	}

	// ========================================================================
	// Feed
	// ========================================================================

	/**
	 * Fetch a page of posts. Pass `after` for pagination (infinite scroll).
	 * Returns the posts and the cursor for the next page.
	 */
	async fetchFeed(config: FeedConfig, after?: string): Promise<{ posts: RedditPost[]; after: string | null }> {
		let path: string;

		if (config.subreddit) {
			path = `/r/${config.subreddit}/${config.sort ?? 'hot'}.json`;
		} else {
			path = `/${config.endpoint}.json`;
		}

		const showMediaOnly = config.showMediaOnly;
		const clampedLimit = clamp(config.limit, 25, 100);
		const normLimit = clampedLimit + (showMediaOnly ? 0 : clampedLimit * 2);

		const params: Record<string, string> = {
			limit: String(normLimit),
		};

		if (after) params.after = after;
		if (
			config.time &&
			(config.sort === 'top' ||
				config.sort === 'controversial' ||
				config.endpoint === 'top' ||
				config.endpoint === 'controversial')
		) {
			params.t = config.time;
		}

		const listing = await this.get<RedditListing<any>>(path, params);
		let posts = listing.data.children
			.filter((child) => child.kind === 't3')
			.map((child) => this.normalizePost(child.data));

		if (!showMediaOnly) {
			posts = posts.filter((post) => {
				const isMedia = post.contentType === 'image' || post.contentType === 'video' || post.contentType === 'gallery';
				const hasNoText = !post.selftext || post.selftext.trim().length === 0;
				return !(isMedia && hasNoText);
			});
		}

		return { posts, after: listing.data.after };
	}

	// ========================================================================
	// Comments
	// ========================================================================

	async fetchComments(postId: string, limit: number = 100): Promise<RedditComment[]> {
		const normLimit = Math.min(limit, 100);
		const response = await this.get<[unknown, RedditListing<any>]>(`/comments/${postId}.json`, {
			limit: String(normLimit + 10),
			depth: '1',
			sort: 'top',
		});
		return this.flattenComments(response[1].data.children, normLimit, 2);
	}

	private flattenComments(children: any[], limit: number, maxDepth: number = 2, depth: number = 0): RedditComment[] {
		const result: RedditComment[] = [];

		for (const child of children) {
			if (child.kind !== 't1') continue;
			if (child.data.author === '[deleted]' || child.data.body === '[deleted]') continue;
			if (child.data.body && child.data.body.length >= MAX_UPGRADE_LENGTH) continue;

			result.push({
				id: child.data.id,
				author: child.data.author,
				body: child.data.body,
				score: child.data.score || child.data.ups,
				createdUtc: child.data.created_utc,
			});

			if (depth < maxDepth && typeof child.data.replies === 'object') {
				const replies = child.data.replies?.data?.children ?? [];
				result.push(...this.flattenComments(replies, maxDepth, depth + 1));
			}
		}

		return result.slice(0, limit).sort((a, b) => b.score - a.score);
	}

	// ========================================================================
	// Normalisation
	// ========================================================================

	private normalizePost(raw: any): RedditPost {
		let contentType: RedditPost['contentType'] = 'link';

		if (raw.is_self) {
			contentType = 'self';
		} else if (raw.url?.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
			contentType = 'image';
		} else if (raw.url?.includes('v.redd.it')) {
			contentType = 'video';
		} else if (raw.url?.includes('reddit.com/gallery')) {
			contentType = 'gallery';
		}

		const preview = this.decodeRedditMediaUrl(raw.preview?.images?.[0]?.source?.url);
		const galleryImages = this.extractGalleryImages(raw);

		return {
			id: raw.id,
			fullname: raw.name,
			subreddit: raw.subreddit,
			title: raw.title,
			url: raw.url,
			permalink: raw.permalink,
			selftext: raw.selftext || undefined,
			author: raw.author,
			score: raw.score || raw.ups,
			upvoteRatio: raw.upvote_ratio,
			numComments: raw.num_comments,
			createdUtc: raw.created_utc,
			contentType,
			thumbnail: raw.thumbnail,
			preview,
			galleryImages,
			flair: raw.link_flair_text,
			isNsfw: raw.over_18,
		};
	}

	private extractGalleryImages(raw: any): string[] | undefined {
		const mediaMetadata = raw.media_metadata ?? {};
		const items = Array.isArray(raw.gallery_data?.items) ? raw.gallery_data.items : [];
		const images = items
			.map((item: { media_id?: string }) => {
				const media = item?.media_id ? mediaMetadata[item.media_id] : null;
				const source = media?.s?.u ?? media?.p?.[media?.p?.length - 1]?.u;
				return this.decodeRedditMediaUrl(source);
			})
			.filter((url: string | undefined): url is string => Boolean(url));

		if (images.length > 0) return images;
		return collectPreviewImages(raw.preview?.images);
	}

	private decodeRedditMediaUrl(url?: string): string | undefined {
		if (!url || typeof url !== 'string') return undefined;
		return url.replaceAll('&amp;', '&');
	}
}

function getRetryDelaySeconds(headers: Headers, fallbackSeconds: number): number {
	const retryAfter = headers.get('retry-after');
	const retryAfterSeconds = parseRetryAfterHeader(retryAfter);
	if (retryAfterSeconds !== null) return retryAfterSeconds;

	const resetHeader = headers.get('x-ratelimit-reset');
	const resetSeconds = parseFiniteSeconds(resetHeader);
	if (resetSeconds !== null) return resetSeconds;

	return Math.max(1, Math.ceil(fallbackSeconds));
}

function parseRetryAfterHeader(value: string | null): number | null {
	if (!value) return null;

	const seconds = parseFiniteSeconds(value);
	if (seconds !== null) return seconds;

	const dateValue = Date.parse(value);
	if (!Number.isNaN(dateValue)) {
		return Math.max(1, Math.ceil((dateValue - Date.now()) / 1000));
	}

	return null;
}

function parseFiniteSeconds(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(1, Math.ceil(parsed));
}

function collectPreviewImages(images: any[] | undefined): string[] | undefined {
	if (!Array.isArray(images)) return undefined;

	const urls = images
		.map((image) => image?.source?.url)
		.filter((url): url is string => typeof url === 'string')
		.map((url) => url.replaceAll('&amp;', '&'));

	return urls.length > 0 ? urls : undefined;
}
