/**
 * Default Application Configuration
 * 
 * Highly customizable settings for Reddit endpoints, caching, and UI behavior.
 */

import { AppConfig, AuthConfig, FeedConfig, SyncConfig, CacheConfig, UIConfig } from '../types';

export const DEFAULT_AUTH: AuthConfig = {
  type: 'cookie',
  tokenV2: '',
  session: '',
  userAgent: 'reddit-client-even/1.0 (Even G2 smart glasses; contact@example.com)',
};

export const DEFAULT_FEED: FeedConfig = {
  endpoint: 'hot',
  limit: 25,
};

export const DEFAULT_SYNC: SyncConfig = {
  enabled: true,
  intervalMinutes: 30,
  autoUpdate: true,
  notifyOnNewPosts: false,
};

export const DEFAULT_CACHE: CacheConfig = {
  maxPosts: 100,
  expireAfterHours: 24,
  cacheComments: true,
};

export const DEFAULT_UI: UIConfig = {
  showThumbnails: false, // G2 has limited image support
  compactView: true,
  defaultSort: 'hot',
  gestures: {
    swipeForward: 'next',
    swipeBackward: 'prev',
    singleTap: 'open',
    doubleTap: 'back',
  },
};

export const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.0',
  auth: DEFAULT_AUTH,
  feed: DEFAULT_FEED,
  sync: DEFAULT_SYNC,
  cache: DEFAULT_CACHE,
  ui: DEFAULT_UI,
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
    requiresAuth: true,
    supportsSort: false,
    supportsTime: false,
    description: 'Personalized best feed (requires login)',
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

export function createFeedConfig(
  endpoint: string = 'hot',
  options: Partial<FeedConfig> = {}
): FeedConfig {
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

  if (config.sync) {
    if (config.sync.intervalMinutes && config.sync.intervalMinutes < 5) {
      errors.push('Sync interval must be at least 5 minutes');
    }
  }

  if (config.cache) {
    if (config.cache.maxPosts && config.cache.maxPosts > 500) {
      errors.push('Max posts cannot exceed 500');
    }
    if (config.cache.expireAfterHours && config.cache.expireAfterHours > 168) {
      errors.push('Cache expiration cannot exceed 7 days (168 hours)');
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
    sync: { ...existing.sync, ...updates.sync },
    cache: { ...existing.cache, ...updates.cache },
    ui: { ...existing.ui, ...updates.ui },
  };
}
