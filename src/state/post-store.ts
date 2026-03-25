/**
 * Post Store - Reactive State Management
 * 
 * Manages the current feed, post selection, and interactions.
 * Provides reactive updates to UI components.
 */

import { CachedPost, FeedConfig, RedditComment } from '../types';
import { PostCache } from '../services/cache/post-cache';
import { RedditClient } from '../services/reddit/client';

type PostStoreListener = () => void;

export interface PostStoreState {
  posts: CachedPost[];
  currentIndex: number;
  loading: boolean;
  error: string | null;
  comments: RedditComment[];
  commentsLoading: boolean;
}

export class PostStore {
  private state: PostStoreState = {
    posts: [],
    currentIndex: 0,
    loading: false,
    error: null,
    comments: [],
    commentsLoading: false,
  };

  private listeners: PostStoreListener[] = [];
  private cache: PostCache;
  private client: RedditClient;
  private currentFeed: FeedConfig | null = null;

  constructor(cache: PostCache, client: RedditClient) {
    this.cache = cache;
    this.client = client;
  }

  // ========================================================================
  // Subscriptions
  // ========================================================================

  subscribe(listener: PostStoreListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  // ========================================================================
  // Getters
  // ========================================================================

  getState(): PostStoreState {
    return { ...this.state };
  }

  getPosts(): CachedPost[] {
    return this.state.posts;
  }

  getCurrentPost(): CachedPost | null {
    return this.state.posts[this.state.currentIndex] || null;
  }

  getCurrentIndex(): number {
    return this.state.currentIndex;
  }

  isLoading(): boolean {
    return this.state.loading;
  }

  getError(): string | null {
    return this.state.error;
  }

  getComments(): RedditComment[] {
    return this.state.comments;
  }

  // ========================================================================
  // Feed Loading
  // ========================================================================

  async loadFeed(config: FeedConfig, forceRefresh = false): Promise<void> {
    this.state.loading = true;
    this.state.error = null;
    this.state.currentIndex = 0;
    this.currentFeed = config;
    this.notify();

    try {
      // Try cache first if not forcing refresh
      if (!forceRefresh) {
        const cached = this.cache.get(config);
        if (cached && cached.length > 0) {
          this.state.posts = cached;
          this.state.loading = false;
          this.notify();
          return;
        }
      }

      // Fetch fresh posts
      const fresh = await this.client.fetchFeed(config);

      // Get seen status
      const cachedPosts = await Promise.all(
        fresh.map(async p => ({
          ...p,
          cachedAt: Date.now(),
          seen: await this.cache.isSeen(p.id),
        }))
      );

      this.state.posts = cachedPosts;

      // Update cache
      await this.cache.set(config, cachedPosts);

    } catch (err) {
      this.state.error = err instanceof Error ? err.message : 'Failed to load feed';
      console.error('[PostStore] Load error:', err);
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  async refresh(): Promise<void> {
    if (this.currentFeed) {
      await this.loadFeed(this.currentFeed, true);
    }
  }

  // ========================================================================
  // Navigation
  // ========================================================================

  nextPost(): void {
    if (this.state.currentIndex < this.state.posts.length - 1) {
      this.state.currentIndex++;
      this.markCurrentSeen();
      this.state.comments = []; // Clear comments on post change
      this.notify();
    }
  }

  prevPost(): void {
    if (this.state.currentIndex > 0) {
      this.state.currentIndex--;
      this.markCurrentSeen();
      this.state.comments = [];
      this.notify();
    }
  }

  goToPost(index: number): void {
    if (index >= 0 && index < this.state.posts.length) {
      this.state.currentIndex = index;
      this.markCurrentSeen();
      this.state.comments = [];
      this.notify();
    }
  }

  private async markCurrentSeen(): Promise<void> {
    const post = this.getCurrentPost();
    if (post && !post.seen) {
      post.seen = true;
      await this.cache.markSeen(post.id);
    }
  }

  // ========================================================================
  // Comments
  // ========================================================================

  async loadComments(): Promise<void> {
    const post = this.getCurrentPost();
    if (!post) return;

    this.state.commentsLoading = true;
    this.notify();

    try {
      const comments = await this.client.fetchComments(post.id, 10);
      this.state.comments = comments;
    } catch (err) {
      console.error('[PostStore] Failed to load comments:', err);
      this.state.comments = [];
    } finally {
      this.state.commentsLoading = false;
      this.notify();
    }
  }

  clearComments(): void {
    this.state.comments = [];
    this.notify();
  }

  // ========================================================================
  // Interactions
  // ========================================================================

  async upvoteCurrent(): Promise<boolean> {
    const post = this.getCurrentPost();
    if (!post) return false;

    try {
      await this.client.upvote(post.fullname);
      post.interaction = 'upvote';
      post.score++; // Optimistic update
      await this.cache.recordInteraction(post.id, 'upvote');
      this.notify();
      return true;
    } catch (err) {
      console.error('[PostStore] Upvote failed:', err);
      return false;
    }
  }

  async downvoteCurrent(): Promise<boolean> {
    const post = this.getCurrentPost();
    if (!post) return false;

    try {
      await this.client.downvote(post.fullname);
      post.interaction = 'downvote';
      post.score--; // Optimistic update
      await this.cache.recordInteraction(post.id, 'downvote');
      this.notify();
      return true;
    } catch (err) {
      console.error('[PostStore] Downvote failed:', err);
      return false;
    }
  }

  async hideCurrent(): Promise<boolean> {
    const post = this.getCurrentPost();
    if (!post) return false;

    try {
      await this.client.hide(post.fullname);
      post.interaction = 'hide';
      await this.cache.recordInteraction(post.id, 'hide');
      this.notify();
      return true;
    } catch (err) {
      console.error('[PostStore] Hide failed:', err);
      return false;
    }
  }

  async saveCurrent(): Promise<boolean> {
    const post = this.getCurrentPost();
    if (!post) return false;

    try {
      await this.client.save(post.fullname);
      post.interaction = 'save';
      await this.cache.recordInteraction(post.id, 'save');
      this.notify();
      return true;
    } catch (err) {
      console.error('[PostStore] Save failed:', err);
      return false;
    }
  }

  // ========================================================================
  // Post Management
  // ========================================================================

  async addNewPosts(newPosts: CachedPost[]): Promise<void> {
    // Add to beginning, remove duplicates
    const existingIds = new Set(this.state.posts.map(p => p.id));
    const uniqueNew = newPosts.filter(p => !existingIds.has(p.id));
    
    this.state.posts = [...uniqueNew, ...this.state.posts];
    this.notify();
  }

  removePost(postId: string): void {
    const index = this.state.posts.findIndex(p => p.id === postId);
    if (index > -1) {
      this.state.posts.splice(index, 1);
      if (this.state.currentIndex >= this.state.posts.length) {
        this.state.currentIndex = Math.max(0, this.state.posts.length - 1);
      }
      this.notify();
    }
  }

  clear(): void {
    this.state.posts = [];
    this.state.currentIndex = 0;
    this.state.comments = [];
    this.notify();
  }
}
