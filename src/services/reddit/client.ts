/**
 * Reddit API Client
 * 
 * Full-featured Reddit client with:
 * - All major feed endpoints (best, hot, new, rising, top, controversial)
 * - Subreddit-specific feeds
 * - Comment fetching
 * - Post interactions (upvote, downvote, hide, save)
 * - Automatic rate limit handling
 * 
 * Based on reddit-pi service implementation.
 */

import { AuthManager } from './auth';
import { RateLimiter } from './rate-limiter';
import { 
  RedditPost, 
  RedditComment, 
  RedditListing, 
  FeedConfig,
  RedditClientInterface 
} from '../../types';

export class RedditClient implements RedditClientInterface {
  private auth: AuthManager;
  private rateLimiter: RateLimiter;
  private baseUrl = 'https://www.reddit.com';

  constructor(auth: AuthManager, rateLimiter: RateLimiter) {
    this.auth = auth;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Initialize the client (authenticates and gets modhash)
   */
  async initialize(): Promise<void> {
    await this.auth.initialize();
  }

  // ========================================================================
  // HTTP Methods
  // ========================================================================

  /**
   * Make a GET request with rate limiting
   */
  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    await this.rateLimiter.throttle();

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('raw_json', '1');

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: this.auth.buildHeaders(),
    });

    // Track rate limits
    this.rateLimiter.updateFromHeaders(response.headers);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed (${response.status}). Please check your Reddit credentials.`);
      }
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as T;
  }

  /**
   * Make a POST request (for actions like voting)
   */
  private async post(path: string, body: Record<string, string>): Promise<unknown> {
    await this.rateLimiter.throttle();

    const url = `${this.baseUrl}${path}`;
    const formData = new URLSearchParams(body);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.auth.buildHeaders({
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: formData.toString(),
    });

    this.rateLimiter.updateFromHeaders(response.headers);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Action failed (${response.status}). Please check authentication.`);
      }
      throw new Error(`Reddit API error: ${response.status}`);
    }

    return response.json();
  }

  // ========================================================================
  // Feed Endpoints
  // ========================================================================

  /**
   * Fetch posts from a feed endpoint
   */
  async fetchFeed(config: FeedConfig): Promise<RedditPost[]> {
    let path: string;

    // Build path based on config
    if (config.subreddit) {
      const sort = config.sort || 'hot';
      path = `/r/${config.subreddit}/${sort}.json`;
    } else if (config.endpoint === 'best') {
      path = '/best.json';
    } else if (config.endpoint.startsWith('r/')) {
      path = `/${config.endpoint}.json`;
    } else {
      path = `/${config.endpoint}.json`;
    }

    const params: Record<string, string> = {
      limit: String(Math.min(config.limit, 100)),
    };

    // Add time filter for top/controversial
    if (config.time && (config.sort === 'top' || config.sort === 'controversial' || 
        config.endpoint === 'top' || config.endpoint === 'controversial')) {
      params.t = config.time;
    }

    const listing = await this.get<RedditListing<any>>(path, params);

    return listing.data.children
      .filter(child => child.kind === 't3')
      .map(child => this.normalizePost(child.data));
  }

  /**
   * Fetch multiple pages of a feed
   */
  async fetchFeedPaginated(config: FeedConfig, maxPosts: number = 100): Promise<RedditPost[]> {
    const posts: RedditPost[] = [];
    let after: string | null = null;

    while (posts.length < maxPosts) {
      const params: Record<string, string> = {
        limit: String(Math.min(100, maxPosts - posts.length)),
      };

      if (after) {
        params.after = after;
      }

      const path = `/${config.endpoint}.json`;
      const listing = await this.get<RedditListing<any>>(path, params);

      const newPosts = listing.data.children
        .filter(child => child.kind === 't3')
        .map(child => this.normalizePost(child.data));

      posts.push(...newPosts);
      after = listing.data.after;

      if (!after || newPosts.length === 0) {
        break;
      }

      // Polite delay between pages
      await new Promise(r => setTimeout(r, 1000));
    }

    return posts.slice(0, maxPosts);
  }

  // ========================================================================
  // Comments
  // ========================================================================

  /**
   * Fetch top comments for a post
   */
  async fetchComments(postId: string, limit: number = 10): Promise<RedditComment[]> {
    const response = await this.get<[unknown, RedditListing<any>]>(
      `/comments/${postId}.json`,
      {
        limit: String(limit),
        depth: '2',
        sort: 'top',
      }
    );

    const commentListing = response[1];
    return this.flattenComments(commentListing.data.children, 2);
  }

  /**
   * Flatten nested comment tree
   */
  private flattenComments(children: any[], maxDepth: number = 2, depth: number = 0): RedditComment[] {
    const result: RedditComment[] = [];

    for (const child of children) {
      if (child.kind !== 't1') continue;
      if (child.data.author === '[deleted]' || child.data.body === '[deleted]') continue;

      result.push({
        id: child.data.id,
        author: child.data.author,
        body: child.data.body,
        score: child.data.score,
        createdUtc: child.data.created_utc,
      });

      // Recursively add replies
      if (depth < maxDepth && typeof child.data.replies === 'object') {
        const replies = child.data.replies?.data?.children || [];
        result.push(...this.flattenComments(replies, maxDepth, depth + 1));
      }
    }

    // Sort by score descending
    return result.sort((a, b) => b.score - a.score);
  }

  // ========================================================================
  // Post Interactions
  // ========================================================================

  /**
   * Upvote a post or comment
   * @param fullname - t3_xxxxx for posts, t1_xxxxx for comments
   */
  async upvote(fullname: string): Promise<void> {
    await this.post('/api/vote', { id: fullname, dir: '1' });
  }

  /**
   * Downvote a post or comment
   */
  async downvote(fullname: string): Promise<void> {
    await this.post('/api/vote', { id: fullname, dir: '-1' });
  }

  /**
   * Remove vote from a post or comment
   */
  async unvote(fullname: string): Promise<void> {
    await this.post('/api/vote', { id: fullname, dir: '0' });
  }

  /**
   * Hide a post from feeds
   */
  async hide(fullname: string): Promise<void> {
    await this.post('/api/hide', { id: fullname });
  }

  /**
   * Unhide a previously hidden post
   */
  async unhide(fullname: string): Promise<void> {
    await this.post('/api/unhide', { id: fullname });
  }

  /**
   * Save a post for later
   */
  async save(fullname: string): Promise<void> {
    await this.post('/api/save', { id: fullname });
  }

  /**
   * Unsave a post
   */
  async unsave(fullname: string): Promise<void> {
    await this.post('/api/unsave', { id: fullname });
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  /**
   * Normalize raw Reddit API post data
   */
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

    return {
      id: raw.id,
      fullname: raw.name,
      subreddit: raw.subreddit,
      title: raw.title,
      url: raw.url,
      permalink: raw.permalink,
      selftext: raw.selftext || undefined,
      author: raw.author,
      score: raw.score,
      upvoteRatio: raw.upvote_ratio,
      numComments: raw.num_comments,
      createdUtc: raw.created_utc,
      contentType,
      thumbnail: raw.thumbnail,
      preview: raw.preview?.images?.[0]?.source?.url,
      flair: raw.link_flair_text,
      isNsfw: raw.over_18,
    };
  }
}
