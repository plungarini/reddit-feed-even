/**
 * IndexedDB Storage Service
 * 
 * Persistent storage for posts, seen posts, and configuration.
 * Uses idb library for easier IndexedDB interaction.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { CachedPost, AppConfig } from '../../types';

interface RedditClientDB extends DBSchema {
  posts: {
    key: string;
    value: CachedPost;
    indexes: { 
      'by-cached-at': number; 
      'by-subreddit': string;
      'by-seen': number;
    };
  };
  config: {
    key: string;
    value: any;
  };
  seen: {
    key: string;
    value: { id: string; seenAt: number };
  };
  interactions: {
    key: string;
    value: { 
      postId: string; 
      action: string; 
      timestamp: number;
    };
  };
}

export class StorageService {
  private db: IDBPDatabase<RedditClientDB> | null = null;
  private readonly DB_NAME = 'reddit-client-db';
  private readonly DB_VERSION = 1;

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    this.db = await openDB<RedditClientDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
        // Posts store
        if (!db.objectStoreNames.contains('posts')) {
          const postStore = db.createObjectStore('posts', { keyPath: 'id' });
          postStore.createIndex('by-cached-at', 'cachedAt');
          postStore.createIndex('by-subreddit', 'subreddit');
          postStore.createIndex('by-seen', 'seen');
        }

        // Config store
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }

        // Seen posts store
        if (!db.objectStoreNames.contains('seen')) {
          db.createObjectStore('seen', { keyPath: 'id' });
        }

        // Interactions store
        if (!db.objectStoreNames.contains('interactions')) {
          db.createObjectStore('interactions', { keyPath: 'postId' });
        }
      },
    });

    console.log('[Storage] Database initialized');
  }

  // ========================================================================
  // Posts
  // ========================================================================

  async savePost(post: CachedPost): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.put('posts', post);
  }

  async savePosts(posts: CachedPost[]): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    
    const tx = this.db.transaction('posts', 'readwrite');
    await Promise.all(posts.map(post => tx.store.put(post)));
    await tx.done;
  }

  async getPost(id: string): Promise<CachedPost | undefined> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.get('posts', id);
  }

  async getAllPosts(): Promise<CachedPost[]> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.getAll('posts');
  }

  async getPostsBySubreddit(subreddit: string): Promise<CachedPost[]> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.getAllFromIndex('posts', 'by-subreddit', subreddit);
  }

  async getSeenPosts(): Promise<CachedPost[]> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.getAllFromIndex('posts', 'by-seen', 1);
  }

  async getUnseenPosts(): Promise<CachedPost[]> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.getAllFromIndex('posts', 'by-seen', 0);
  }

  async deletePost(id: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.delete('posts', id);
  }

  async deleteOldPosts(maxAgeHours: number): Promise<number> {
    if (!this.db) throw new Error('DB not initialized');

    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    const tx = this.db.transaction('posts', 'readwrite');
    const index = tx.store.index('by-cached-at');

    const oldPosts = await index.getAll(IDBKeyRange.upperBound(cutoff));
    await Promise.all(oldPosts.map(post => tx.store.delete(post.id)));
    await tx.done;

    return oldPosts.length;
  }

  async clearPosts(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.clear('posts');
  }

  async getPostCount(): Promise<number> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.count('posts');
  }

  // ========================================================================
  // Config
  // ========================================================================

  async getConfig<T>(key: string): Promise<T | undefined> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.get('config', key);
  }

  async setConfig<T>(key: string, value: T): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.put('config', value, key);
  }

  async deleteConfig(key: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.delete('config', key);
  }

  // ========================================================================
  // Seen Posts (lightweight deduplication)
  // ========================================================================

  async markSeen(postId: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.put('seen', { id: postId, seenAt: Date.now() });
  }

  async isSeen(postId: string): Promise<boolean> {
    if (!this.db) throw new Error('DB not initialized');
    const record = await this.db.get('seen', postId);
    return !!record;
  }

  async getSeenIds(): Promise<Set<string>> {
    if (!this.db) throw new Error('DB not initialized');
    const all = await this.db.getAll('seen');
    return new Set(all.map(s => s.id));
  }

  async getSeenCount(): Promise<number> {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.count('seen');
  }

  async clearSeen(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.clear('seen');
  }

  // ========================================================================
  // Interactions
  // ========================================================================

  async recordInteraction(postId: string, action: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.put('interactions', {
      postId,
      action,
      timestamp: Date.now(),
    });
  }

  async getInteraction(postId: string): Promise<string | undefined> {
    if (!this.db) throw new Error('DB not initialized');
    const record = await this.db.get('interactions', postId);
    return record?.action;
  }

  async getAllInteractions(): Promise<Map<string, string>> {
    if (!this.db) throw new Error('DB not initialized');
    const all = await this.db.getAll('interactions');
    return new Map(all.map(i => [i.postId, i.action]));
  }

  // ========================================================================
  // Maintenance
  // ========================================================================

  async cleanup(olderThanHours: number = 168): Promise<{ posts: number; seen: number }> {
    const postsDeleted = await this.deleteOldPosts(olderThanHours);
    
    // Also clean old seen entries
    const seenCutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);
    const tx = this.db?.transaction('seen', 'readwrite');
    let seenDeleted = 0;
    
    if (tx) {
      const cursor = await tx.store.openCursor();
      while (cursor) {
        if (cursor.value.seenAt < seenCutoff) {
          await cursor.delete();
          seenDeleted++;
        }
        await cursor.continue();
      }
      await tx.done;
    }

    return { posts: postsDeleted, seen: seenDeleted };
  }

  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.clear('posts');
    await this.db.clear('seen');
    await this.db.clear('interactions');
  }
}
