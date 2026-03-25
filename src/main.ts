/**
 * Reddit Client for Even Realities G2
 * 
 * Main application entry point.
 * 
 * CONFIGURATION FLOW:
 * 1. User visits config.html (hosted on GitHub Pages or locally)
 * 2. User pastes Reddit token and configures settings
 * 3. Config is saved to localStorage
 * 4. G2 app reads from same localStorage (shared with Safari WebView)
 * 5. If no config found, shows instructions to visit config page
 */

import { waitForEvenAppBridge, OsEventTypeList, EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { StorageService } from './services/cache/storage';
import { PostCache } from './services/cache/post-cache';
import { AuthManager } from './services/reddit/auth';
import { RateLimiter } from './services/reddit/rate-limiter';
import { RedditClient } from './services/reddit/client';
import { SyncEngine } from './services/sync/sync-engine';
import { SyncScheduler } from './services/sync/scheduler';
import { PostStore } from './state/post-store';
import { UIManager } from './state/ui-manager';
import { FeedView } from './ui/components/feed-view';
import { DetailView } from './ui/components/detail-view';
import { CommentView } from './ui/components/comment-view';
import { MenuView } from './ui/components/menu-view';
import { DEFAULT_CONFIG } from './config/app-config';
import { AppConfig, ViewMode } from './types';

// Configuration storage keys (must match config.html)
const CONFIG_KEY = 'reddit-client-config';
const AUTH_KEY = 'reddit-client-auth';

// ============================================================================
// Configuration Loader
// ============================================================================

interface LoadedConfig {
  config: AppConfig;
  hasAuth: boolean;
}

function loadConfiguration(): LoadedConfig {
  // Try to load from localStorage (set by config.html)
  const authData = localStorage.getItem(AUTH_KEY);
  const configData = localStorage.getItem(CONFIG_KEY);

  const auth = authData ? JSON.parse(authData) : null;
  const savedConfig = configData ? JSON.parse(configData) : null;

  // Merge with defaults
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    ...savedConfig,
    auth: {
      ...DEFAULT_CONFIG.auth,
      ...(auth ? { tokenV2: auth.tokenV2, userAgent: auth.userAgent } : {}),
    },
    feed: {
      ...DEFAULT_CONFIG.feed,
      ...savedConfig?.feed,
    },
    sync: {
      ...DEFAULT_CONFIG.sync,
      ...savedConfig?.sync,
    },
  };

  return {
    config,
    hasAuth: !!auth?.tokenV2,
  };
}

// ============================================================================
// Application
// ============================================================================

class RedditClientApp {
  // Services
  private storage!: StorageService;
  private authManager!: AuthManager;
  private rateLimiter!: RateLimiter;
  private redditClient!: RedditClient;
  private postCache!: PostCache;
  private syncEngine!: SyncEngine;
  private syncScheduler!: SyncScheduler;

  // State
  private postStore!: PostStore;
  private uiManager!: UIManager;
  private appConfig!: AppConfig;
  private hasAuth = false;

  // UI
  private bridge!: EvenAppBridge;
  private feedView!: FeedView;
  private detailView!: DetailView;
  private commentView!: CommentView;
  private menuView!: MenuView;

  // Event handling
  private lastEventTime = 0;
  private eventCooldown = 300;
  private initialized = false;

  async initialize(): Promise<void> {
    console.log('[RedditClient] Starting...');

    // Load configuration from localStorage
    const { config, hasAuth } = loadConfiguration();
    this.appConfig = config;
    this.hasAuth = hasAuth;

    console.log('[RedditClient] Auth:', hasAuth ? 'Present' : 'Not configured');

    // Initialize storage
    this.storage = new StorageService();
    await this.storage.initialize();

    // Initialize services
    this.authManager = new AuthManager(this.appConfig.auth);
    this.rateLimiter = new RateLimiter();
    this.redditClient = new RedditClient(this.authManager, this.rateLimiter);
    this.postCache = new PostCache(this.storage, {
      maxMemoryEntries: 10,
      maxStoragePosts: this.appConfig.cache.maxPosts,
      expireAfterHours: this.appConfig.cache.expireAfterHours,
    });
    this.syncEngine = new SyncEngine(this.redditClient, this.postCache);
    this.syncScheduler = new SyncScheduler(
      this.syncEngine,
      this.appConfig.sync.intervalMinutes
    );

    // Initialize state
    this.postStore = new PostStore(this.postCache, this.redditClient);
    this.uiManager = new UIManager();

    // Initialize Reddit client (may fail if no auth)
    if (this.hasAuth) {
      try {
        await this.redditClient.initialize();
        console.log('[RedditClient] Reddit client authenticated');

        // Start background sync if enabled
        if (this.appConfig.sync.enabled) {
          this.syncScheduler.start(this.appConfig.feed);
        }
      } catch (err) {
        console.warn('[RedditClient] Auth failed:', err);
        this.hasAuth = false;
      }
    }

    // Wait for Even Hub bridge
    this.bridge = await waitForEvenAppBridge();
    console.log('[RedditClient] Even Hub bridge ready');

    // Initialize UI components
    this.feedView = new FeedView(this.bridge);
    this.detailView = new DetailView(this.bridge);
    this.commentView = new CommentView(this.bridge);
    this.menuView = new MenuView(this.bridge);

    // Setup event handling
    this.setupEventHandlers();

    // Subscribe to state changes
    this.postStore.subscribe(() => this.render());
    this.uiManager.subscribe(() => this.render());

    this.initialized = true;

    // Check if we need to show setup instructions
    if (!this.hasAuth) {
      await this.showSetupInstructions();
    } else {
      // Load initial feed
      await this.postStore.loadFeed(this.appConfig.feed);
    }

    console.log('[RedditClient] Ready!');
  }

  /**
   * Show setup instructions when no auth is configured
   */
  private async showSetupInstructions(): Promise<void> {
    const content = `
⚠️ Setup Required

Reddit authentication not configured.

To get started:

1. Visit the config page:
   https://plungarini.github.io/reddit-client-even/config.html

2. Follow instructions to:
   • Get your Reddit token
   • Configure your feed
   • Set preferences

3. Return to this app

Your settings will be saved automatically.

Double-tap to refresh after setup.
    `.trim();

    const { CreateStartUpPageContainer, TextContainerProperty } = await import('@evenrealities/even_hub_sdk');

    const container = new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 1,
          borderColor: 5,
          borderRadius: 4,
          paddingLength: 8,
          containerID: 1,
          containerName: 'setup',
          isEventCapture: 1,
          content,
        }),
      ],
    });

    await this.bridge.createStartUpPageContainer(container);
  }

  /**
   * Setup Even Hub event handlers
   */
  private setupEventHandlers(): void {
    this.bridge.onEvenHubEvent((event) => {
      // Throttle events
      const now = Date.now();
      if (now - this.lastEventTime < this.eventCooldown) {
        return;
      }
      this.lastEventTime = now;

      const type = event.textEvent?.eventType ?? event.sysEvent?.eventType;
      const listEvent = event.listEvent;
      const view = this.uiManager.getCurrentView();

      // Handle list selection
      if (listEvent && view === 'feed') {
        const index = listEvent.currentSelectItemIndex ?? 0;
        this.postStore.goToPost(index);
        this.uiManager.setView('detail');
        return;
      }

      // CLICK_EVENT (0) sometimes comes as undefined
      const isClick = type === OsEventTypeList.CLICK_EVENT || type === undefined;
      const isDoubleClick = type === OsEventTypeList.DOUBLE_CLICK_EVENT;
      const isScrollBottom = type === OsEventTypeList.SCROLL_BOTTOM_EVENT;
      const isScrollTop = type === OsEventTypeList.SCROLL_TOP_EVENT;

      // If not authenticated, only allow double-tap to retry
      if (!this.hasAuth) {
        if (isDoubleClick) {
          // Reload config and retry
          const { hasAuth } = loadConfiguration();
          if (hasAuth) {
            location.reload();
          }
        }
        return;
      }

      // View-specific handling
      switch (view) {
        case 'feed':
          this.handleFeedEvents(isClick, isDoubleClick, isScrollTop, isScrollBottom);
          break;
        case 'detail':
          this.handleDetailEvents(isClick, isDoubleClick, isScrollTop, isScrollBottom);
          break;
        case 'comments':
          this.handleCommentEvents(isClick, isDoubleClick);
          break;
        case 'menu':
          this.handleMenuEvents(isClick, isDoubleClick);
          break;
      }
    });
  }

  private handleFeedEvents(
    isClick: boolean,
    isDoubleClick: boolean,
    isScrollTop: boolean,
    isScrollBottom: boolean
  ): void {
    if (isScrollBottom) {
      this.postStore.nextPost();
    } else if (isScrollTop) {
      this.postStore.prevPost();
    } else if (isClick) {
      this.uiManager.setView('detail');
    } else if (isDoubleClick) {
      this.uiManager.setView('menu');
    }
  }

  private handleDetailEvents(
    isClick: boolean,
    isDoubleClick: boolean,
    isScrollTop: boolean,
    isScrollBottom: boolean
  ): void {
    if (isDoubleClick) {
      this.uiManager.goBack();
    } else if (isClick) {
      this.postStore.loadComments();
      this.uiManager.setView('comments');
    } else if (isScrollBottom) {
      this.postStore.nextPost();
    } else if (isScrollTop) {
      this.postStore.prevPost();
    }
  }

  private handleCommentEvents(isClick: boolean, isDoubleClick: boolean): void {
    if (isDoubleClick) {
      this.postStore.clearComments();
      this.uiManager.goBack();
    }
  }

  private handleMenuEvents(isClick: boolean, isDoubleClick: boolean): void {
    if (isDoubleClick) {
      this.uiManager.goBack();
    }
  }

  /**
   * Render current view
   */
  private async render(): Promise<void> {
    if (!this.initialized || !this.hasAuth) return;

    const view = this.uiManager.getCurrentView();

    try {
      switch (view) {
        case 'feed':
          await this.renderFeed();
          break;
        case 'detail':
          await this.renderDetail();
          break;
        case 'comments':
          await this.renderComments();
          break;
        case 'menu':
          await this.renderMenu();
          break;
      }
    } catch (err) {
      console.error('[RedditClient] Render error:', err);
    }
  }

  private async renderFeed(): Promise<void> {
    const state = this.postStore.getState();
    await this.feedView.render(state.posts, state.currentIndex);
  }

  private async renderDetail(): Promise<void> {
    const post = this.postStore.getCurrentPost();
    if (post) {
      await this.detailView.render(post);
    }
  }

  private async renderComments(): Promise<void> {
    const comments = this.postStore.getComments();
    await this.commentView.render(comments);
  }

  private async renderMenu(): Promise<void> {
    const items = [
      { id: 'refresh', label: 'Refresh Feed', icon: '↻' },
      { id: 'upvote', label: 'Upvote Post', icon: '▲' },
      { id: 'downvote', label: 'Downvote Post', icon: '▼' },
      { id: 'hide', label: 'Hide Post', icon: '✓' },
      { id: 'save', label: 'Save Post', icon: '★' },
      { id: 'comments', label: 'View Comments', icon: '💬' },
      { id: 'back', label: 'Go Back', icon: '←' },
    ];
    await this.menuView.render(items, 0);
  }

  /**
   * Get public API for debugging
   */
  getAPI() {
    return {
      // Navigation
      next: () => this.postStore.nextPost(),
      prev: () => this.postStore.prevPost(),
      view: (view: ViewMode) => this.uiManager.setView(view),
      back: () => this.uiManager.goBack(),

      // Feed
      loadFeed: (endpoint: string) => {
        const config = { ...this.appConfig.feed, endpoint: endpoint as any };
        return this.postStore.loadFeed(config);
      },
      refresh: () => this.postStore.refresh(),

      // Interactions
      upvote: () => this.postStore.upvoteCurrent(),
      downvote: () => this.postStore.downvoteCurrent(),
      hide: () => this.postStore.hideCurrent(),
      save: () => this.postStore.saveCurrent(),
      comments: () => {
        this.postStore.loadComments();
        this.uiManager.setView('comments');
      },

      // Sync
      sync: () => this.syncScheduler.triggerNow(),
      syncStatus: () => this.syncEngine.getState(),

      // Config
      config: () => ({ ...this.appConfig }),
      reloadConfig: () => {
        const { config, hasAuth } = loadConfiguration();
        this.appConfig = config;
        this.hasAuth = hasAuth;
        if (hasAuth) {
          location.reload();
        }
      },

      // Stats
      cacheStats: () => this.postCache.getStats(),
      storageStats: async () => ({
        posts: await this.storage.getPostCount(),
        seen: await this.storage.getSeenCount(),
      }),
    };
  }
}

// ============================================================================
// Bootstrap
// ============================================================================

async function main() {
  const app = new RedditClientApp();

  try {
    await app.initialize();

    // Expose API globally for debugging
    (window as any).redditClient = app.getAPI();

    console.log('[RedditClient] Use window.redditClient for API access');
  } catch (err) {
    console.error('[RedditClient] Fatal error:', err);
  }
}

// Start the app
main();
