/**
 * Background Sync Engine
 * 
 * Fetches new posts periodically and updates the cache.
 * Handles deduplication and seen post filtering.
 */

import { FeedConfig, CachedPost, SyncResult } from '../../types';
import { RedditClient } from '../reddit/client';
import { PostCache } from '../cache/post-cache';

export type SyncStatus = 'idle' | 'running' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastRunAt: Date | null;
  lastResult: SyncResult | null;
  postsInLastSync: number;
}

export class SyncEngine {
  private client: RedditClient;
  private cache: PostCache;
  private state: SyncState = {
    status: 'idle',
    lastRunAt: null,
    lastResult: null,
    postsInLastSync: 0,
  };
  private listeners: Array<(state: SyncState) => void> = [];

  constructor(client: RedditClient, cache: PostCache) {
    this.client = client;
    this.cache = cache;
  }

  /**
   * Subscribe to sync state changes
   */
  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => l({ ...this.state }));
  }

  /**
   * Get current sync state
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Perform a sync operation
   */
  async sync(feedConfig: FeedConfig): Promise<SyncResult> {
    if (this.state.status === 'running') {
      return { success: false, postsAdded: 0, error: 'Sync already in progress' };
    }

    this.state.status = 'running';
    this.notify();

    try {
      console.log('[SyncEngine] Starting sync...');

      // Fetch fresh posts
      const freshPosts = await this.client.fetchFeed(feedConfig);
      console.log(`[SyncEngine] Fetched ${freshPosts.length} posts`);

      // Get existing cached posts for this feed
      const cached = this.cache.get(feedConfig) || [];
      const existingIds = new Set(cached.map(p => p.id));

      // Get seen post IDs
      const seenIds = await this.cache.getSeenIds();

      // Find new posts that haven't been seen
      const newPosts: CachedPost[] = [];
      for (const post of freshPosts) {
        if (!existingIds.has(post.id) && !seenIds.has(post.id)) {
          newPosts.push({
            ...post,
            cachedAt: Date.now(),
            seen: false,
          });
        }
      }

      console.log(`[SyncEngine] Found ${newPosts.length} new posts`);

      // Merge and cache
      const merged = [...newPosts, ...cached].slice(0, feedConfig.limit);
      await this.cache.set(feedConfig, merged);

      // Update state
      this.state.status = 'idle';
      this.state.lastRunAt = new Date();
      this.state.postsInLastSync = newPosts.length;
      this.state.lastResult = {
        success: true,
        postsAdded: newPosts.length,
      };
      this.notify();

      console.log(`[SyncEngine] Sync complete: ${newPosts.length} new posts`);

      return {
        success: true,
        postsAdded: newPosts.length,
      };
    } catch (error) {
      console.error('[SyncEngine] Sync failed:', error);

      this.state.status = 'error';
      this.state.lastRunAt = new Date();
      this.state.lastResult = {
        success: false,
        postsAdded: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.notify();

      return this.state.lastResult;
    }
  }

  /**
   * Sync multiple feeds
   */
  async syncMultiple(configs: FeedConfig[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const config of configs) {
      const result = await this.sync(config);
      results.push(result);
      // Polite delay between feeds
      await new Promise(r => setTimeout(r, 2000));
    }
    return results;
  }

  /**
   * Check if sync is running
   */
  isRunning(): boolean {
    return this.state.status === 'running';
  }

  /**
   * Reset error state to idle
   */
  reset(): void {
    if (this.state.status === 'error') {
      this.state.status = 'idle';
      this.notify();
    }
  }
}
