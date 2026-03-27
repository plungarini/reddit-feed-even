/**
 * Reddit Client for Even Realities G2
 *
 * Architecture:
 *   - FeedView: ListContainerProperty with native selection highlighting
 *   - DetailView: TextContainerProperty with scrollable content
 *   - CommentView: ListContainerProperty with toggleable tree
 *   - Navigation: Stack-based with context preservation
 */

import {
	CreateStartUpPageContainer,
	OsEventTypeList,
	RebuildPageContainer,
	StartUpPageCreateResult,
	TextContainerProperty,
	waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { AuthManager } from './api/auth-manager';
import { RateLimiter } from './api/rate-limiter';
import { RedditClient } from './api/reddit-client';
import { DEFAULT_CONFIG } from './core/config';
import type { AppConfig } from './core/types';
import { UIManager } from './core/ui-manager';
import { CommentView } from './features/comments/comment-view';
import { DetailView } from './features/detail/detail-view';
import { FeedView } from './features/feed/feed-view';
import { PostStore } from './features/feed/post-store';
import { PostCache } from './shared/storage/cache';
import { StorageService } from './shared/storage/storage';

const CONFIG_KEY = 'reddit-client-config';
const AUTH_KEY = 'reddit-client-auth';

// ─── Globals ────────────────────────────────────────────────────────────────

let pageCreated = false; // set true after first createStartUpPageContainer call; never reset
let isRendering = false;
let renderQueued = false;

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;

// ─── Debug panel ────────────────────────────────────────────────────────────

function debugState(update: Record<string, unknown>) {
	globalThis.dispatchEvent(new CustomEvent('app:state', { detail: update }));
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

main().catch((err) => {
	console.error('[RedditClient] Fatal error:', err);
});

// ─── Status screen helpers ───────────────────────────────────────────────────

function statusParams(content: string) {
	return {
		containerTotalNum: 1,
		textObject: [
			new TextContainerProperty({
				xPosition: 0,
				yPosition: 0,
				width: 576,
				height: 288,
				borderWidth: 0,
				paddingLength: 12,
				containerID: 1,
				containerName: 'main',
				isEventCapture: 1,
				content,
			}),
		],
	};
}

async function showStatus(bridge: Bridge, content: string): Promise<void> {
	if (!pageCreated) {
		console.log('[SDK] createStartUpPageContainer...');
		const startupParam = new CreateStartUpPageContainer(statusParams(content));
		const result = await bridge.createStartUpPageContainer(startupParam);
		console.log(
			'[SDK] createStartUpPageContainer result:',
			result,
			result === StartUpPageCreateResult.success ? '(success)' : '(FAILED)',
		);
		if (result === StartUpPageCreateResult.success) {
			pageCreated = true;
		} else {
			// result=1 means the glasses already have a page from a prior session.
			// Take ownership immediately by rebuilding the existing page.
			console.log('[SDK] Page already exists — falling back to rebuildPageContainer...');
			const ok = await bridge.rebuildPageContainer(new RebuildPageContainer(statusParams(content)));
			console.log('[SDK] rebuildPageContainer (session takeover):', ok);
			if (ok) pageCreated = true;
		}
	} else {
		console.log('[SDK] rebuildPageContainer (status)...');
		const ok = await bridge.rebuildPageContainer(new RebuildPageContainer(statusParams(content)));
		console.log('[SDK] rebuildPageContainer (status):', ok);
	}
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log('[RedditClient] Starting...');
	debugState({ status: 'starting', bridgeReady: false });

	// Bridge must come first
	let bridge: Bridge;
	try {
		bridge = await waitForEvenAppBridge();
		console.log('[RedditClient] Bridge ready');
		debugState({ bridgeReady: true });
	} catch (e) {
		console.warn('[RedditClient] Bridge not available:', e);
		debugState({ status: 'error', error: `Bridge unavailable: ${e}` });
		return;
	}

	// Auth check - token is optional
	const authData = localStorage.getItem(AUTH_KEY);
	const configData = localStorage.getItem(CONFIG_KEY);
	const auth = authData ? JSON.parse(authData) : null;
	const hasAuth = !!(auth?.tokenV2 && auth?.session);

	console.log('[RedditClient] hasAuth:', hasAuth);
	debugState({ hasAuth });

	// Loading screen — establishes the page session via createStartUpPageContainer.
	// All subsequent SDK calls (rebuildPageContainer) depend on this having been called first.
	debugState({ status: 'loading' });
	await showStatus(bridge, 'Reddit Client\n\nLoading feed...');

	// Services
	const storage = new StorageService();
	await storage.initialize();

	// Parse saved config and merge deeply with defaults
	const savedConfig = JSON.parse(configData || '{}');
	const config: AppConfig = {
		...DEFAULT_CONFIG,
		...savedConfig,
		auth: {
			...DEFAULT_CONFIG.auth,
			...savedConfig.auth,
			tokenV2: auth?.tokenV2 || '',
			session: auth?.session || '',
			userAgent: auth?.userAgent || DEFAULT_CONFIG.auth.userAgent,
			// proxyUrl is saved into AUTH_KEY by debug-panel.js, not CONFIG_KEY
			proxyUrl: auth?.proxyUrl || savedConfig.auth?.proxyUrl || '',
		},
		feed: {
			...DEFAULT_CONFIG.feed,
			...savedConfig.feed,
		},
		cache: {
			...DEFAULT_CONFIG.cache,
			...savedConfig.cache,
		},
		sync: {
			...DEFAULT_CONFIG.sync,
			...savedConfig.sync,
		},
		ui: {
			...DEFAULT_CONFIG.ui,
			...savedConfig.ui,
		},
	};

	const authManager = new AuthManager(config.auth);
	const rateLimiter = new RateLimiter();
	const redditClient = new RedditClient(authManager, rateLimiter);
	const postCache = new PostCache(storage, { maxStoragePosts: config.cache.maxPosts });
	const postStore = new PostStore(postCache, redditClient);
	const uiManager = new UIManager();

	// Reddit client init
	try {
		await redditClient.initialize();
		console.log('[RedditClient] Reddit client ready');
	} catch (e) {
		console.warn('[RedditClient] Reddit init warning:', e);
	}

	// Views
	const feedView = new FeedView(bridge);
	const detailView = new DetailView(bridge);
	const commentView = new CommentView(bridge);

	// ─── Event handler ────────────────────────────────────────────────────────

	bridge.onEvenHubEvent((event) => {
		const state = postStore.getState();
		if (state.loading || state.loadingMore || state.commentsLoading) {
			console.log('[Event] Ignoring event while loading');
			return;
		}

		const entry = uiManager.getCurrentEntry();
		const view = entry.view;

		// Resolve event type
		const type = event.textEvent?.eventType ?? event.sysEvent?.eventType ?? event.listEvent?.eventType;

		// Extract list event data if present
		const listEvent = event.listEvent;

		// Handle all events
		console.log(`[Event] view=${view} type=${type} (${OsEventTypeList[type as number] ?? 'CLICK'})`);
		if (listEvent) {
			console.log(
				`[Event] listEvent index=${listEvent.currentSelectItemIndex} name="${listEvent.currentSelectItemName}"`,
			);
		}

		if (view === 'feed') {
			handleFeedEvent(type, postStore, uiManager);
		} else if (view === 'detail') {
			handleDetailEvent(type, postStore, uiManager, commentView);
		} else if (view === 'comments') {
			handleCommentsEvent(type, listEvent, postStore, uiManager, commentView);
		}
	});

	// ─── Subscriptions ────────────────────────────────────────────────────────

	postStore.subscribe(() => {
		scheduleRender(bridge, postStore, uiManager, feedView, detailView, commentView);
	});

	uiManager.subscribe(() => {
		// Reset comment view when navigating away
		const view = uiManager.getCurrentView();
		if (view !== 'comments') commentView.reset();

		scheduleRender(bridge, postStore, uiManager, feedView, detailView, commentView);
	});

	// ─── Load feed ────────────────────────────────────────────────────────────

	await postStore.loadFeed(config.feed);
	const finalState = postStore.getState();
	if (finalState.error) {
		debugState({ status: 'error', posts: 0, error: finalState.error });
	} else {
		debugState({ status: 'ready', posts: finalState.posts.length, error: null });
	}
	console.log('[RedditClient] Ready! Posts:', finalState.posts.length);
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

/**
 * Handle feed view events — manual scroll tracking.
 *
 * FeedView uses 6 TextContainerProperty instances (no firmware-managed list).
 * We track the highlighted index manually:
 *   SCROLL_DOWN → increment; at footer (index=postsPerPage) → next page
 *   SCROLL_UP   → decrement; below 0 → prev page
 *   CLICK       → open highlighted post, or load-more if footer selected
 *   DOUBLE_CLICK → refresh feed
 */
function handleFeedEvent(type: OsEventTypeList | undefined, postStore: PostStore, uiManager: UIManager): void {
	const state = postStore.getState();
	const pagePosts = postStore.getCurrentPagePosts();
	const lastIndex = Math.max(0, pagePosts.length - 1);

	if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
		const next = state.highlightedIndex + 1;
		if (next <= lastIndex) {
			postStore.setHighlight(next);
		} else if (state.hasMore) {
			// At last post and scroll down -> next page
			postStore.nextPage().catch(console.error);
		}
	} else if (type === OsEventTypeList.SCROLL_TOP_EVENT) {
		const prev = state.highlightedIndex - 1;
		if (prev >= 0) {
			postStore.setHighlight(prev);
		} else if (state.currentPage > 0) {
			// At first post and scroll up -> prev page
			postStore.prevPage();
		}
	} else if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
		// Highlight now only ever lands on posts
		const post = postStore.getHighlightedPost();
		if (post) {
			console.log(`[Feed] Opening post: ${post.id}`);
			const currentEntry = uiManager.getCurrentEntry();
			uiManager.pushView({
				view: 'detail',
				postId: post.id,
				pageIndex: currentEntry.pageIndex,
				highlightIndex: currentEntry.highlightIndex,
			});
		}
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		console.log('[Event] Refreshing feed...');
		postStore.refresh().catch(console.error);
	}
}

/**
 * Handle detail view events with text container
 *
 * Text container doesn't send listEvent.
 * - CLICK: go to comments
 * - DOUBLE_CLICK: back to feed
 * - Scroll events scroll content (firmware handled)
 */
function handleDetailEvent(
	type: OsEventTypeList | undefined,
	postStore: PostStore,
	uiManager: UIManager,
	commentView: CommentView,
): void {
	if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
		// Single tap = go to comments
		const post = postStore.getHighlightedPost();
		if (post) {
			console.log(`[Detail] Opening comments for: ${post.id}`);
			commentView.reset();
			postStore.loadComments().catch(console.error);
			uiManager.pushView({ view: 'comments', postId: post.id });
		}
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		// Double tap = back to feed
		console.log('[Detail] Going back to feed');
		uiManager.goBack();
	}
	// Scroll events are consumed by text container for content scrolling
}

/**
 * Handle comments view events with ListContainerProperty
 *
 * List container sends listEvent with currentSelectItemIndex.
 * - listEvent: track which comment is selected
 * - CLICK: toggle expand/collapse
 * - DOUBLE_CLICK: back to detail
 */
function handleCommentsEvent(
	type: OsEventTypeList | undefined,
	listEvent: { currentSelectItemIndex?: number; currentSelectItemName?: string } | undefined,
	postStore: PostStore,
	uiManager: UIManager,
	commentView: CommentView,
): void {
	// Track selection from list event
	if (listEvent) {
		const index = listEvent.currentSelectItemIndex;
		const name = listEvent.currentSelectItemName;

		// Check if "Load more" item
		if (name?.includes('Load more') && type === OsEventTypeList.CLICK_EVENT) {
			const state = postStore.getState();
			if (state.hasMoreComments && !state.commentsLoading) {
				postStore.loadMoreComments().catch(console.error);
			}
			return;
		}

		// Single tap on comment = toggle expand
		if ((type === OsEventTypeList.CLICK_EVENT || type === undefined) && index !== undefined) {
			const comment = commentView.getCommentAt(index);
			if (comment) {
				console.log(`[Comments] Toggling comment ${comment.id}`);
				postStore.toggleComment(comment.id);
			}
		}
	}

	if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		// Double tap = back to detail (NOT feed!)
		console.log('[Comments] Going back to detail');
		uiManager.goBack();
	}
}

// ─── Render System ──────────────────────────────────────────────────────────

function scheduleRender(
	bridge: Bridge,
	postStore: PostStore,
	uiManager: UIManager,
	feedView: FeedView,
	detailView: DetailView,
	commentView: CommentView,
): void {
	if (isRendering) {
		renderQueued = true;
		return;
	}
	doRender(bridge, postStore, uiManager, feedView, detailView, commentView);
}

function doRender(
	bridge: Bridge,
	postStore: PostStore,
	uiManager: UIManager,
	feedView: FeedView,
	detailView: DetailView,
	commentView: CommentView,
): void {
	isRendering = true;
	render(bridge, postStore, uiManager, feedView, detailView, commentView)
		.catch((err) => console.error('[Render] Uncaught error:', err))
		.finally(() => {
			isRendering = false;
			if (renderQueued) {
				renderQueued = false;
				doRender(bridge, postStore, uiManager, feedView, detailView, commentView);
			}
		});
}

async function render(
	bridge: Bridge,
	postStore: PostStore,
	uiManager: UIManager,
	feedView: FeedView,
	detailView: DetailView,
	commentView: CommentView,
): Promise<void> {
	const entry = uiManager.getCurrentEntry();
	const view = entry.view;
	const state = postStore.getState();

	console.log(`[Render] view=${view} page=${state.currentPage} highlight=${state.highlightedIndex}`);
	debugState({
		view,
		page: state.currentPage,
		highlight: state.highlightedIndex,
		posts: state.posts.length,
		error: state.error ?? null,
	});

	try {
		switch (view) {
			case 'feed':
				if (state.error && state.posts.length === 0) {
					await showStatus(bridge, `Reddit Client\n\nError\n\n${state.error}`);
					return;
				}
				if (state.loading && state.posts.length === 0) {
					console.log('[Render] Waiting for initial posts...');
					return;
				}
				await feedView.render(
					state.posts,
					state.currentPage,
					state.highlightedIndex ?? 0,
					state.hasMore,
					state.loadingMore,
				);
				break;

			case 'detail': {
				const post = postStore.getHighlightedPost();
				if (!post) {
					console.warn('[Render] No post for detail view');
					uiManager.goBack();
					return;
				}
				await detailView.render(post);
				break;
			}

			case 'comments':
				await commentView.render(state.comments, state.hasMoreComments, state.commentsLoading);
				break;
		}
	} catch (e) {
		console.error('[Render] Error:', e);
		try {
			await showStatus(bridge, `Error\n\n${e instanceof Error ? e.message : String(e)}`);
		} catch {
			/* ignore */
		}
	}
}
