/**
 * Reddit Client - Type Definitions
 * 
 * Based on reddit-pi service research and Reddit API documentation
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
  replies?: RedditComment[];
}

export interface RedditListing<T> {
  kind: string;
  data: {
    children: Array<{ kind: string; data: T }>;
    after: string | null;
    before: string | null;
    modhash?: string;
    dist?: number;
  };
}

export interface RedditMoreComments {
  kind: 'more';
  data: {
    count: number;
    name: string;
    id: string;
    parent_id: string;
    children: string[];
  };
}

// ============================================================================
// App State Types
// ============================================================================

export interface CachedPost extends RedditPost {
  cachedAt: number;
  seen: boolean;
  interaction?: 'upvote' | 'downvote' | 'hide' | 'save';
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
  sync: SyncConfig;
  cache: CacheConfig;
  ui: UIConfig;
}

export interface AuthConfig {
  type: 'cookie' | 'oauth';
  tokenV2?: string;
  session?: string;
  userAgent: string;
  modhash?: string;
}

export interface SyncConfig {
  enabled: boolean;
  intervalMinutes: number;
  autoUpdate: boolean;
  notifyOnNewPosts: boolean;
}

export interface CacheConfig {
  maxPosts: number;
  expireAfterHours: number;
  cacheComments: boolean;
}

export interface UIConfig {
  showThumbnails: boolean;
  compactView: boolean;
  defaultSort: SortOption;
  gestures: GestureConfig;
}

export interface GestureConfig {
  swipeForward: Action;
  swipeBackward: Action;
  singleTap: Action;
  doubleTap: Action;
}

export type Action = 
  | 'next' 
  | 'prev' 
  | 'scrollUp' 
  | 'scrollDown' 
  | 'open' 
  | 'back' 
  | 'upvote' 
  | 'downvote' 
  | 'menu' 
  | 'comments' 
  | 'refresh';

// ============================================================================
// UI Types
// ============================================================================

export type ViewMode = 'feed' | 'detail' | 'comments' | 'menu';

export interface SyncResult {
  success: boolean;
  postsAdded: number;
  error?: string;
}

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
  fetchFeed(config: FeedConfig): Promise<RedditPost[]>;
  fetchComments(postId: string, limit?: number): Promise<RedditComment[]>;
  upvote(fullname: string): Promise<void>;
  downvote(fullname: string): Promise<void>;
  unvote(fullname: string): Promise<void>;
  hide(fullname: string): Promise<void>;
  unhide(fullname: string): Promise<void>;
  save(fullname: string): Promise<void>;
  unsave(fullname: string): Promise<void>;
}

export interface CacheEntry {
  posts: CachedPost[];
  fetchedAt: number;
  config: FeedConfig;
}
