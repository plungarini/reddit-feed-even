/**
 * Default Application Configuration
 *
 * Highly customizable settings for Reddit endpoints, caching, and UI behavior.
 */

import { ApiConfig, AppConfig, AuthConfig, CacheConfig, FeedConfig } from './types';

export const DEFAULT_AUTH: AuthConfig = {
	type: 'cookie',
	tokenV2: '',
	session: '',
	userAgent: 'reddit-feed-even/1.0 (Even Realities)',
	proxyUrl: '',
};

export const DEFAULT_API: ApiConfig = {
	baseUrl: 'https://reddit-feed-even.plungarini.workers.dev',
};

export const DEFAULT_FEED: FeedConfig = {
	endpoint: 'hot',
	limit: 25,
};

export const DEFAULT_CACHE: CacheConfig = {
	durationMs: 5 * 60 * 1000,
};

export const DEFAULT_CONFIG: AppConfig = {
	version: '1.0.0',
	auth: DEFAULT_AUTH,
	feed: DEFAULT_FEED,
	cache: DEFAULT_CACHE,
	api: DEFAULT_API,
};

// ============================================================================
// Reddit Endpoint Configuration
// ============================================================================

export interface EndpointDefinition {
	name: string;
	path: string;
	requiresAuth: boolean;
	supportsSort: boolean;
	supportsTime: boolean;
	description: string;
}

export const ENDPOINTS: Record<string, EndpointDefinition> = {
	best: {
		name: 'Best',
		path: '/best.json',
		requiresAuth: false,
		supportsSort: false,
		supportsTime: false,
		description: 'Personalized best feed (better with auth)',
	},
	hot: {
		name: 'Hot',
		path: '/hot.json',
		requiresAuth: false,
		supportsSort: false,
		supportsTime: false,
		description: 'Currently trending posts',
	},
	new: {
		name: 'New',
		path: '/new.json',
		requiresAuth: false,
		supportsSort: false,
		supportsTime: false,
		description: 'Newest posts first',
	},
	rising: {
		name: 'Rising',
		path: '/rising.json',
		requiresAuth: false,
		supportsSort: false,
		supportsTime: false,
		description: 'Posts gaining popularity',
	},
	top: {
		name: 'Top',
		path: '/top.json',
		requiresAuth: false,
		supportsSort: false,
		supportsTime: true,
		description: 'Top posts by time period',
	},
	controversial: {
		name: 'Controversial',
		path: '/controversial.json',
		requiresAuth: false,
		supportsSort: false,
		supportsTime: true,
		description: 'Most controversial posts',
	},
	'r/popular': {
		name: 'Popular',
		path: '/r/popular.json',
		requiresAuth: false,
		supportsSort: true,
		supportsTime: true,
		description: 'Popular across Reddit',
	},
	'r/all': {
		name: 'All',
		path: '/r/all.json',
		requiresAuth: false,
		supportsSort: true,
		supportsTime: true,
		description: 'Posts from all of Reddit',
	},
};

export const SORT_OPTIONS = ['hot', 'new', 'top', 'rising', 'controversial'] as const;

export const TIME_FILTERS: { value: string; label: string }[] = [
	{ value: 'hour', label: 'Past Hour' },
	{ value: 'day', label: 'Past Day' },
	{ value: 'week', label: 'Past Week' },
	{ value: 'month', label: 'Past Month' },
	{ value: 'year', label: 'Past Year' },
	{ value: 'all', label: 'All Time' },
];

// ============================================================================
// Configuration Helpers
// ============================================================================

export function createFeedConfig(endpoint: string = 'hot', options: Partial<FeedConfig> = {}): FeedConfig {
	const base: FeedConfig = {
		endpoint: endpoint as any,
		limit: 25,
	};

	// Handle subreddit-specific feeds
	if (endpoint.startsWith('r/') && !ENDPOINTS[endpoint]) {
		base.subreddit = endpoint.substring(2);
		base.endpoint = 'hot';
	}

	// Apply time filter for top/controversial
	const endpointDef = ENDPOINTS[endpoint];
	if (endpointDef?.supportsTime && !options.time) {
		base.time = 'day';
	}

	return { ...base, ...options };
}

export function validateConfig(config: Partial<AppConfig>): string[] {
	const errors: string[] = [];

	if (config.feed) {
		if (config.feed.limit && (config.feed.limit < 5 || config.feed.limit > 100)) {
			errors.push('Feed limit must be between 5 and 100');
		}
	}

	return errors;
}

export function mergeConfig(existing: AppConfig, updates: Partial<AppConfig>): AppConfig {
	return {
		...existing,
		...updates,
		auth: { ...existing.auth, ...updates.auth },
		feed: { ...existing.feed, ...updates.feed },
		cache: { ...existing.cache, ...updates.cache },
		api: { ...existing.api, ...updates.api },
	};
}
