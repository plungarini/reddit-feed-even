/**
 * Reddit Client - Type Definitions
 */

// ============================================================================
// Reddit API Types
// ============================================================================

export interface RedditPost {
  id: string;
  fullname: string;           // t3_xxxxx format
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  selftext?: string;
  author: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  contentType: 'link' | 'self' | 'image' | 'video' | 'gallery';
  thumbnail?: string;
  preview?: string;
  flair?: string;
  isNsfw: boolean;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  createdUtc: number;
  depth?: number;              // Indentation level (0 = top)
  parentId?: string;
  replies?: RedditComment[];
  collapsed?: boolean;         // UI state
  hasMoreReplies?: boolean;
}

export interface RedditListing<T> {
  kind: string;
  data: {
    children: Array<{ kind: string; data: T }>;
    after: string | null;
  };
}

// ============================================================================
// App State Types
// ============================================================================

export interface CachedPost extends RedditPost {
  cachedAt: number;
  seen: boolean;
}

export interface FeedConfig {
  endpoint: FeedEndpoint;
  subreddit?: string;
  sort?: SortOption;
  time?: TimeFilter;
  limit: number;
}

export type FeedEndpoint =
  | 'best'
  | 'hot'
  | 'new'
  | 'rising'
  | 'top'
  | 'controversial'
  | 'r/popular'
  | 'r/all';

export type SortOption = 'hot' | 'new' | 'top' | 'rising' | 'controversial';
export type TimeFilter = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  version: string;
  auth: AuthConfig;
  feed: FeedConfig;
  cache: CacheConfig;
}

export interface AuthConfig {
  type: 'cookie' | 'oauth';
  tokenV2?: string;
  session?: string;
  userAgent: string;
  proxyUrl?: string;
}

export interface CacheConfig {
  durationMs: number;
}



// ============================================================================
// UI Types
// ============================================================================

export type ViewMode = 'feed' | 'detail' | 'comments';

export interface RateLimitState {
  used: number;
  remaining: number;
  resetSeconds: number;
  lastUpdated: number;
}

// ============================================================================
// Service Types
// ============================================================================

export interface RedditClientInterface {
  initialize(): Promise<void>;
  fetchFeed(config: FeedConfig, after?: string): Promise<{ posts: RedditPost[]; after: string | null }>;
  fetchComments(postId: string, limit?: number): Promise<RedditComment[]>;
}

