/**
 * Post Cache with LRU Eviction
 * 
 * Two-level caching:
 * 1. In-memory LRU cache for current session (fast)
 * 2. IndexedDB for persistence across sessions
 * 
 * Features:
 * - Automatic expiration based on age
 * - Seen post tracking for deduplication
 * - Configurable size limits
 */

import { CachedPost, FeedConfig, CacheEntry } from '../../types';
import { StorageService } from './storage';

interface CacheOptions {
  maxMemoryEntries?: number;
  maxStoragePosts?: number;
  expireAfterHours?: number;
}

export class PostCache {
  private memoryCache = new Map<string, CacheEntry>();
  private storage: StorageService;
  private maxMemoryEntries: number;
  private maxStoragePosts: number;
  private expireAfterMs: number;

  constructor(storage: StorageService, options: CacheOptions = {}) {
    this.storage = storage;
    this.maxMemoryEntries = options.maxMemoryEntries ?? 10;
    this.maxStoragePosts = options.maxStoragePosts ?? 100;
    this.expireAfterMs = (options.expireAfterHours ?? 24) * 60 * 60 * 1000;
  }

  /**
   * Generate a unique cache key for a feed config
   */
  generateKey(config: FeedConfig): string {
    const parts = [config.endpoint];
    if (config.subreddit) parts.push(`r:${config.subreddit}`);
    if (config.sort) parts.push(`sort:${config.sort}`);
    if (config.time) parts.push(`time:${config.time}`);
    return parts.join(':');
  }

  // ========================================================================
  // Memory Cache Operations
  // ========================================================================

  /**
   * Get posts from memory cache
   */
  get(config: FeedConfig): CachedPost[] | null {
    const key = this.generateKey(config);
    const entry = this.memoryCache.get(key);

    if (!entry) return null;

    // Check expiration
    if (Date.now() - entry.fetchedAt > this.expireAfterMs) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.posts;
  }

  /**
   * Store posts in memory cache and persist to storage
   */
  async set(config: FeedConfig, posts: CachedPost[]): Promise<void> {
    const key = this.generateKey(config);

    // Evict oldest if at capacity
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
    }

    // Add to memory cache
    this.memoryCache.set(key, {
      posts,
      fetchedAt: Date.now(),
      config,
    });

    // Persist to storage
    await this.persistPosts(posts);
  }

  /**
   * Check if cache has entry (even if expired)
   */
  has(config: FeedConfig): boolean {
    return this.memoryCache.has(this.generateKey(config));
  }

  /**
   * Remove entry from memory cache
   */
  remove(config: FeedConfig): boolean {
    return this.memoryCache.delete(this.generateKey(config));
  }

  /**
   * Clear all memory cache
   */
  clear(): void {
    this.memoryCache.clear();
  }

  // ========================================================================
  // Storage Operations
  // ========================================================================

  /**
   * Get posts from persistent storage
   */
  async getFromStorage(subreddit?: string): Promise<CachedPost[]> {
    if (subreddit) {
      return this.storage.getPostsBySubreddit(subreddit);
    }
    return this.storage.getAllPosts();
  }

  /**
   * Persist posts to storage with limit enforcement
   */
  private async persistPosts(posts: CachedPost[]): Promise<void> {
    const toSave = posts.map(p => ({
      ...p,
      cachedAt: Date.now(),
    }));

    await this.storage.savePosts(toSave);

    // Enforce storage limit
    const count = await this.storage.getPostCount();
    if (count > this.maxStoragePosts) {
      await this.storage.deleteOldPosts(1); // This will delete oldest
    }
  }

  // ========================================================================
  // Seen Post Tracking
  // ========================================================================

  /**
   * Mark a post as seen
   */
  async markSeen(postId: string): Promise<void> {
    await this.storage.markSeen(postId);

    // Update in memory cache
    for (const entry of this.memoryCache.values()) {
      const post = entry.posts.find(p => p.id === postId);
      if (post) {
        post.seen = true;
        break;
      }
    }
  }

  /**
   * Check if post has been seen
   */
  async isSeen(postId: string): Promise<boolean> {
    return this.storage.isSeen(postId);
  }

  /**
   * Get all seen post IDs
   */
  async getSeenIds(): Promise<Set<string>> {
    return this.storage.getSeenIds();
  }

  /**
   * Filter out seen posts from a list
   */
  async filterUnseen(posts: CachedPost[]): Promise<CachedPost[]> {
    const seenIds = await this.getSeenIds();
    return posts.filter(p => !seenIds.has(p.id));
  }

  // ========================================================================
  // Interactions
  // ========================================================================

  /**
   * Record an interaction (upvote, downvote, etc.)
   */
  async recordInteraction(postId: string, action: string): Promise<void> {
    await this.storage.recordInteraction(postId, action);

    // Update in memory cache
    for (const entry of this.memoryCache.values()) {
      const post = entry.posts.find(p => p.id === postId);
      if (post) {
        post.interaction = action as any;
        break;
      }
    }
  }

  /**
   * Get interaction for a post
   */
  async getInteraction(postId: string): Promise<string | undefined> {
    return this.storage.getInteraction(postId);
  }

  // ========================================================================
  // Maintenance
  // ========================================================================

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<{ memory: number; storage: number }> {
    // Clean memory cache
    let memoryCleaned = 0;
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.fetchedAt > this.expireAfterMs) {
        this.memoryCache.delete(key);
        memoryCleaned++;
      }
    }

    // Clean storage
    const expireHours = this.expireAfterMs / (60 * 60 * 1000);
    const storageCleaned = await this.storage.deleteOldPosts(expireHours);

    return { memory: memoryCleaned, storage: storageCleaned };
  }

  /**
   * Get cache statistics
   */
  getStats(): { memoryEntries: number; expireAfterMs: number } {
    return {
      memoryEntries: this.memoryCache.size,
      expireAfterMs: this.expireAfterMs,
    };
  }

  /**
   * Update configuration
   */
  updateOptions(options: Partial<CacheOptions>): void {
    if (options.maxMemoryEntries !== undefined) {
      this.maxMemoryEntries = options.maxMemoryEntries;
    }
    if (options.maxStoragePosts !== undefined) {
      this.maxStoragePosts = options.maxStoragePosts;
    }
    if (options.expireAfterHours !== undefined) {
      this.expireAfterMs = options.expireAfterHours * 60 * 60 * 1000;
    }
  }
}
