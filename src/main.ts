/**
 * Reddit Client for Even Realities G2
 */

import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { StorageService } from './services/cache/storage';
import { PostCache } from './services/cache/post-cache';
import { AuthManager } from './services/reddit/auth';
import { RateLimiter } from './services/reddit/rate-limiter';
import { RedditClient } from './services/reddit/client';
import { SyncEngine } from './services/sync/sync-engine';
import { PostStore } from './state/post-store';
import { UIManager } from './state/ui-manager';
import { FeedView } from './ui/components/feed-view';
import { DetailView } from './ui/components/detail-view';
import { CommentView } from './ui/components/comment-view';
import { DEFAULT_CONFIG } from './config/app-config';

const CONFIG_KEY = 'reddit-client-config';
const AUTH_KEY = 'reddit-client-auth';

// Simple error display
try {
  main();
} catch (err) {
  console.error('[RedditClient] Fatal error:', err);
  alert('Error: ' + (err instanceof Error ? err.message : String(err)));
}

async function main() {
  console.log('[RedditClient] Starting...');
  
  // Load config
  const authData = localStorage.getItem(AUTH_KEY);
  const configData = localStorage.getItem(CONFIG_KEY);
  const auth = authData ? JSON.parse(authData) : null;
  const hasAuth = !!auth?.tokenV2;
  
  console.log('[RedditClient] Has auth:', hasAuth);
  
  if (!hasAuth) {
    console.log('[RedditClient] No auth, showing setup');
    return; // index.html handles the setup UI
  }
  
  // Initialize services
  const storage = new StorageService();
  await storage.initialize();
  
  const config = {
    ...DEFAULT_CONFIG,
    auth: { ...DEFAULT_CONFIG.auth, tokenV2: auth.tokenV2, userAgent: auth.userAgent },
    ...JSON.parse(configData || '{}'),
  };
  
  const authManager = new AuthManager(config.auth);
  const rateLimiter = new RateLimiter();
  const redditClient = new RedditClient(authManager, rateLimiter);
  const postCache = new PostCache(storage, { maxStoragePosts: config.cache.maxPosts });
  const syncEngine = new SyncEngine(redditClient, postCache);
  const postStore = new PostStore(postCache, redditClient);
  const uiManager = new UIManager();
  
  // Init Reddit (may fail)
  try {
    await redditClient.initialize();
    console.log('[RedditClient] Reddit client ready');
  } catch (e) {
    console.warn('[RedditClient] Reddit auth failed:', e);
  }
  
  // Wait for Even Hub bridge with timeout
  console.log('[RedditClient] Waiting for Even Hub bridge...');
  let bridge;
  try {
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Bridge timeout')), 8000)
    );
    bridge = await Promise.race([waitForEvenAppBridge(), timeout]);
    console.log('[RedditClient] Bridge ready');
  } catch (e) {
    console.warn('[RedditClient] Bridge not available:', e);
    alert('Even Hub bridge not available. This app requires G2 glasses.');
    return;
  }
  
  // Setup UI
  const feedView = new FeedView(bridge);
  const detailView = new DetailView(bridge);
  const commentView = new CommentView(bridge);
  
  // Event handlers
  let lastEvent = 0;
  bridge.onEvenHubEvent((event) => {
    const now = Date.now();
    if (now - lastEvent < 300) return;
    lastEvent = now;
    
    const type = event.textEvent?.eventType ?? event.sysEvent?.eventType;
    const view = uiManager.getCurrentView();
    
    if (view === 'feed') {
      if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) postStore.nextPost();
      else if (type === OsEventTypeList.SCROLL_TOP_EVENT) postStore.prevPost();
      else if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
        uiManager.setView('detail');
      }
    } else if (view === 'detail') {
      if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) uiManager.goBack();
      else if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
        uiManager.setView('comments');
      }
    }
  });
  
  // Subscribe and render
  postStore.subscribe(() => render(postStore, uiManager, feedView, detailView, commentView));
  uiManager.subscribe(() => render(postStore, uiManager, feedView, detailView, commentView));
  
  // Load feed
  await postStore.loadFeed(config.feed);
  console.log('[RedditClient] Ready!');
}

async function render(postStore: PostStore, uiManager: UIManager, feedView: FeedView, detailView: DetailView, commentView: CommentView) {
  const view = uiManager.getCurrentView();
  const state = postStore.getState();
  
  try {
    if (view === 'feed') {
      await feedView.render(state.posts, state.currentIndex);
    } else if (view === 'detail') {
      const post = postStore.getCurrentPost();
      if (post) await detailView.render(post);
    } else if (view === 'comments') {
      await commentView.render(state.comments);
    }
  } catch (e) {
    console.error('[RedditClient] Render error:', e);
  }
}
