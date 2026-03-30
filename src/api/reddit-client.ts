/**
 * Reddit API Client
 *
 * Proxies all requests through the local Express server (server/index.ts)
 * which sets Cookie headers server-side — the browser Fetch API cannot.
 */

import { ApiConfig, FeedConfig, RedditClientInterface, RedditComment, RedditListing, RedditPost } from '../core/types';
import { AuthManager } from './auth-manager';
import { RateLimiter } from './rate-limiter';

export class RedditClient implements RedditClientInterface {
	private readonly auth: AuthManager;
	private readonly rateLimiter: RateLimiter;
	private readonly apiConfig: ApiConfig;

	/** Proxy base URL — auto-detects LAN IP or uses configured remote Worker. */
	private onRateLimit?: (seconds: number) => void;

	constructor(auth: AuthManager, rateLimiter: RateLimiter, apiConfig: ApiConfig) {
		this.auth = auth;
		this.rateLimiter = rateLimiter;
		this.apiConfig = apiConfig;
	}

	setRateLimitCallback(cb: (seconds: number) => void): void {
		this.onRateLimit = cb;
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

		console.log(`[RedditClient] GET ${url.pathname}${url.search} (retry=${isRetry})`);

		let response: Response;
		try {
			response = await fetch(url.toString(), {
				headers: this.proxyHeaders(),
				signal: AbortSignal.timeout(15_000),
			});
		} catch (err) {
			const name = err instanceof Error ? err.name : '';
			if (name === 'TimeoutError' || name === 'AbortError') {
				throw new Error(`Request timed out (15s). URL: ${url.pathname}`);
			}
			throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
		}

		this.rateLimiter.updateFromHeaders(response.headers);

		if (!response.ok) {
			if (response.status === 429 && !isRetry) {
				const resetHeader = response.headers.get('x-ratelimit-reset') || response.headers.get('Retry-After');
				const resetSeconds = resetHeader ? Number.parseInt(resetHeader, 10) : 60;

				if (resetSeconds <= 120) {
					console.warn(`[RedditClient] 429 Rate Limit. Waiting ${resetSeconds}s before retry...`);
					this.onRateLimit?.(resetSeconds);
					await new Promise((resolve) => setTimeout(resolve, resetSeconds * 1000 + 500));
					return this.get<T>(path, params, true);
				}
			}

			if (response.status === 401 || response.status === 403) {
				throw new Error(`Authentication failed (${response.status}). Check Reddit tokens.`);
			}
			throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
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

		const params: Record<string, string> = {
			limit: String(Math.min(config.limit, 100)),
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
		const posts = listing.data.children
			.filter((child) => child.kind === 't3')
			.map((child) => this.normalizePost(child.data));

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
			if (child.data.body && child.data.body.length >= 1900) continue;

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

		// Reddit encodes preview URLs with &amp; — decode for direct use
		const preview = raw.preview?.images?.[0]?.source?.url?.replaceAll('&amp;', '&');

		return {
			id: raw.id,
			fullname: raw.name,
			subreddit: raw.subreddit,
			title: raw.title,
			url: raw.url,
			permalink: raw.permalink,
			selftext: raw.selftext || undefined,
			author: raw.author,
			score: raw.score || raw.data.ups,
			upvoteRatio: raw.upvote_ratio,
			numComments: raw.num_comments,
			createdUtc: raw.created_utc,
			contentType,
			thumbnail: raw.thumbnail,
			preview,
			flair: raw.link_flair_text,
			isNsfw: raw.over_18,
		};
	}
}
