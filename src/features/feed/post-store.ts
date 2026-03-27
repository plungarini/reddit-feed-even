/**
 * Post Store - Reactive State Management
 *
 * Manages the current feed with page-based navigation:
 * - Posts displayed in pages (4 posts per page)
 * - Highlight tracks selection within current page
 * - Background prefetch when nearing end of loaded posts
 * - Comment tree with toggleable collapse/expand
 *
 * Cache: simple in-memory TTL cache. Posts are held for `cacheDurationMs`
 * (read from window.APP_CONFIG at startup). On refresh (double-tap) the
 * cache is bypassed and fresh posts are fetched.
 */

import { RedditClient } from '../../api/reddit-client';
import { CachedPost, FeedConfig, RedditComment } from '../../core/types';

type PostStoreListener = () => void;

export interface PostStoreState {
	posts: CachedPost[];
	currentPage: number; // Current page index (0, 1, 2...)
	postsPerPage: number; // Fixed at 4
	highlightedIndex: number; // Within current page (0-3)
	loading: boolean;
	loadingMore: boolean;
	hasMore: boolean;
	error: string | null;
	// Comment state
	comments: RedditComment[];
	commentsPage: number;
	hasMoreComments: boolean;
	commentsLoading: boolean;
	expandedComments: Set<string>;
}

export class PostStore {
	private readonly state: PostStoreState = {
		posts: [],
		currentPage: 0,
		postsPerPage: 4,
		highlightedIndex: 0,
		loading: false,
		loadingMore: false,
		hasMore: true,
		error: null,
		comments: [],
		commentsPage: 0,
		hasMoreComments: false,
		commentsLoading: false,
		expandedComments: new Set(),
	};

	private readonly listeners: PostStoreListener[] = [];
	private readonly client: RedditClient;
	private currentFeed: FeedConfig | null = null;
	private afterCursor: string | null = null;

	// Simple in-memory cache — no persistence, no IndexedDB
	private cachedPosts: CachedPost[] | null = null;
	private cacheTimestamp = 0;
	private readonly cacheDurationMs: number;

	constructor(client: RedditClient, cacheDurationMs: number) {
		this.client = client;
		this.cacheDurationMs = cacheDurationMs;
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
		this.listeners.forEach((l) => l());
	}

	// ========================================================================
	// Getters
	// ========================================================================

	getState(): PostStoreState {
		return { ...this.state };
	}

	/**
	 * Get post at current highlight position
	 */
	getHighlightedPost(): CachedPost | null {
		const absoluteIndex = this.state.currentPage * this.state.postsPerPage + this.state.highlightedIndex;
		return this.state.posts[absoluteIndex] ?? null;
	}

	/**
	 * Get current page's posts
	 */
	getCurrentPagePosts(): CachedPost[] {
		const start = this.state.currentPage * this.state.postsPerPage;
		return this.state.posts.slice(start, start + this.state.postsPerPage);
	}

	/**
	 * Get total pages available
	 */
	getTotalPages(): number {
		return Math.ceil(this.state.posts.length / this.state.postsPerPage);
	}

	// ========================================================================
	// Feed Loading
	// ========================================================================

	async loadFeed(config: FeedConfig, forceRefresh = false): Promise<void> {
		this.state.loading = true;
		this.state.error = null;
		this.state.currentPage = 0;
		this.state.highlightedIndex = 0;
		this.state.hasMore = true;
		this.state.posts = [];
		this.afterCursor = null;
		this.currentFeed = config;
		this.notify();

		try {
			// Return cached posts if still fresh and not forced
			if (!forceRefresh && this.cachedPosts !== null && Date.now() - this.cacheTimestamp < this.cacheDurationMs) {
				console.log(
					`[PostStore] Cache hit (${this.cachedPosts.length} posts, age=${Math.round((Date.now() - this.cacheTimestamp) / 1000)}s)`,
				);
				this.state.posts = this.cachedPosts;
				this.state.loading = false;
				this.notify();
				return;
			}

			const { posts: fresh, after } = await this.client.fetchFeed(config);
			this.afterCursor = after;
			this.state.hasMore = after !== null;

			const posts = fresh.map((p) => ({ ...p, cachedAt: Date.now(), seen: false }));
			this.state.posts = posts;
			this.cachedPosts = posts;
			this.cacheTimestamp = Date.now();
			console.log(`[PostStore] Fetched ${posts.length} posts, cached for ${Math.round(this.cacheDurationMs / 1000)}s`);
		} catch (err) {
			this.state.error = err instanceof Error ? err.message : 'Failed to load feed';
			console.error('[PostStore] loadFeed error:', err);
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
	// Page Navigation
	// ========================================================================

	/**
	 * Go to next page, prefetch if needed
	 */
	async nextPage(): Promise<void> {
		const nextPage = this.state.currentPage + 1;
		const postsNeeded = (nextPage + 1) * this.state.postsPerPage;

		// Check if we need more posts
		if (postsNeeded > this.state.posts.length && this.state.hasMore && !this.state.loadingMore) {
			await this.loadMore();
		}

		// Only advance if we have posts for that page
		if (nextPage * this.state.postsPerPage < this.state.posts.length) {
			this.state.loadingMore = true;
			this.notify();

			await new Promise((resolve) => setTimeout(resolve, 500));

			this.state.currentPage = nextPage;
			this.state.loadingMore = false;
			this.state.highlightedIndex = 0;
			this.notify();
		}
	}

	/**
	 * Go to previous page
	 */
	prevPage(): void {
		if (this.state.currentPage > 0) {
			this.state.currentPage--;
			this.state.highlightedIndex = 3;
			this.notify();
		}
	}

	/**
	 * Set highlight index within current page
	 */
	setHighlight(index: number): void {
		const pagePosts = this.getCurrentPagePosts();
		const lastPostIndex = Math.max(0, pagePosts.length - 1);
		const clamped = Math.max(0, Math.min(index, lastPostIndex));
		if (clamped !== this.state.highlightedIndex) {
			this.state.highlightedIndex = clamped;
			this.notify();
		}
	}

	/**
	 * Append more posts from Reddit (pagination cursor, not cached)
	 */
	private async loadMore(): Promise<void> {
		if (!this.currentFeed || !this.afterCursor || this.state.loadingMore) {
			return;
		}

		this.state.loadingMore = true;
		this.notify();

		try {
			const { posts: fresh, after } = await this.client.fetchFeed(this.currentFeed, this.afterCursor);
			this.afterCursor = after;
			this.state.hasMore = after !== null;

			const existingIds = new Set(this.state.posts.map((p) => p.id));
			const newPosts = fresh
				.filter((p) => !existingIds.has(p.id))
				.map((p) => ({ ...p, cachedAt: Date.now(), seen: false }));

			this.state.posts = [...this.state.posts, ...newPosts];
			console.log(`[PostStore] loadMore: added ${newPosts.length} posts, total=${this.state.posts.length}`);
		} catch (err) {
			console.error('[PostStore] loadMore error:', err);
		} finally {
			this.state.loadingMore = false;
			this.notify();
		}
	}

	// ========================================================================
	// Comments
	// ========================================================================

	async loadComments(): Promise<void> {
		const post = this.getHighlightedPost();
		if (!post) return;

		this.state.commentsLoading = true;
		this.state.comments = [];
		this.state.commentsPage = 0;
		this.state.hasMoreComments = false;
		this.state.expandedComments.clear();
		this.notify();

		try {
			const comments = await this.client.fetchComments(post.id, 10);
			this.state.comments = this.processComments(comments);
			this.state.hasMoreComments = comments.length === 10;
		} catch (err) {
			console.error('[PostStore] loadComments error:', err);
			this.state.comments = [];
		} finally {
			this.state.commentsLoading = false;
			this.notify();
		}
	}

	async loadMoreComments(): Promise<void> {
		const post = this.getHighlightedPost();
		if (!post || !this.state.hasMoreComments || this.state.commentsLoading) return;

		this.state.commentsLoading = true;
		this.notify();

		try {
			const moreComments = await this.client.fetchComments(post.id, 10);
			const processed = this.processComments(moreComments);
			this.state.comments.push(...processed);
			this.state.commentsPage++;
			this.state.hasMoreComments = moreComments.length === 10;
		} catch (err) {
			console.error('[PostStore] loadMoreComments error:', err);
		} finally {
			this.state.commentsLoading = false;
			this.notify();
		}
	}

	/**
	 * Process raw comments — add depth and default collapsed state
	 */
	private processComments(comments: RedditComment[], depth = 0): RedditComment[] {
		return comments.map((c) => ({
			...c,
			depth,
			collapsed: depth > 0,
			replies: c.replies ? this.processComments(c.replies, depth + 1) : [],
		}));
	}

	/**
	 * Toggle comment expanded/collapsed state
	 */
	toggleComment(commentId: string): void {
		if (this.state.expandedComments.has(commentId)) {
			this.state.expandedComments.delete(commentId);
		} else {
			this.state.expandedComments.add(commentId);
		}
		this.notify();
	}

	isCommentExpanded(commentId: string): boolean {
		return this.state.expandedComments.has(commentId);
	}
}
