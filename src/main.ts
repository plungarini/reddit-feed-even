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
import { DEFAULT_CONFIG, mergeConfig } from './core/config';
import type { AppConfig } from './core/types';
import { UIManager } from './core/ui-manager';
import { CommentView } from './features/comments/comment-view';
import { DetailView } from './features/detail/detail-view';
import { FeedView } from './features/feed/feed-view';
import { FEED_ITEMS, MenuView } from './features/feed/menu-view';
import { PostStore } from './features/feed/post-store';
import { getStringChunks } from './shared/utils';

const CONFIG_KEY = 'reddit-client-config';
const AUTH_KEY = 'reddit-client-auth';

const LOAD_ANIM_MS = 300;

// ─── Globals ────────────────────────────────────────────────────────────────

let pageCreated = false; // set true after first createStartUpPageContainer call; never reset
let isRendering = false;
let renderQueued = false;

// Transient active endpoint — NOT persisted; resets to config default on reload
let activeEndpoint: import('./core/types').FeedEndpoint = 'hot';

// ─── Loading animation state ─────────────────────────────────────────────────
let animDots = 3;
let loadAnimInterval: ReturnType<typeof setInterval> | null = null;
let animTickFn: (() => void) | null = null; // set in main() once views are ready
let menuSelecting = false; // guard against spurious menu rebuilds after selection

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;

// ─── Debug panel ────────────────────────────────────────────────────────────

function debugState(update: Record<string, unknown>) {
	globalThis.dispatchEvent(new CustomEvent('app:state', { detail: update }));
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

main().catch((err) => {
	console.error('[RedditClient] Fatal error:', err);
});

/** Approximate px per text line and padding for status containers */
const STATUS_LINE_H = 32;
const STATUS_PAD = 6;
const STATUS_DASHES = 28; // box char-width (fits in 576px; no px math needed)

/**
 * Builds a visual box:
 *   ╭─  Title  ─────────────────────────────────╮
 *   │
 *   │ content line 1
 *   │ content line 2
 *   │
 *   ╰───────────────────────────────────────────╯
 */
function buildStatusBox(title: string, content: string): string {
	const titleSection = `─     ${title}     `;
	const dashCount = Math.max(0, STATUS_DASHES - title.length);
	const top = `╭${titleSection}${'─'.repeat(dashCount)}╮`;
	const bodyLines = getStringChunks(content, 55).map((l) => `│    ${l}`);
	const bottom = `╰${'─'.repeat(STATUS_DASHES / 2)}`;
	return [top, '│', ...bodyLines, '│', bottom].join('\n');
}

function statusParams(content: string, isError = false) {
	isError = isError || content.toLowerCase().includes('error');

	const title = isError ? 'Fatal Error' : 'Reddit Feed';
	const box = buildStatusBox(title, content);

	const lineCount = box.split('\n').length;
	const h = Math.min(250, lineCount * STATUS_LINE_H + STATUS_PAD * 2);
	const y = Math.max(0, Math.floor((288 - h) / 2));

	return {
		containerTotalNum: 1,
		textObject: [
			new TextContainerProperty({
				xPosition: 0,
				yPosition: y,
				width: 576,
				height: h,
				borderWidth: 0,
				paddingLength: STATUS_PAD,
				containerID: 1,
				containerName: 'main',
				isEventCapture: 0,
				content: box,
			}),
		],
	};
}

async function showStatus(bridge: Bridge, content: string, isError = false): Promise<void> {
	const params = statusParams(content, isError);
	if (!pageCreated) {
		const result = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(params));
		if (result === StartUpPageCreateResult.success) {
			pageCreated = true;
		} else {
			// Session takeover
			try {
				const ok = await bridge.rebuildPageContainer(new RebuildPageContainer(params));
				if (ok) pageCreated = true;
			} catch (e) {
				console.error('[SDK] Session takeover failed:', e);
			}
		}
	} else {
		// Use rebuildPageContainer for status box updates for maximum reliability
		try {
			await bridge.rebuildPageContainer(new RebuildPageContainer(params));
		} catch (error) {
			console.error('[SDK] showStatus rebuild failed:', error);
		}
	}
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log('[RedditClient] Starting…');
	debugState({ status: 'starting', bridgeReady: false });

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

	// Proper config initialization: defaults < saved config < legacy auth data
	const savedConfig = configData ? JSON.parse(configData) : {};
	const config: AppConfig = mergeConfig(DEFAULT_CONFIG, savedConfig);

	// Legacy auth override: ensure authData's token/session take precedence if found
	if (auth?.tokenV2 && auth?.session) {
		config.auth.tokenV2 = auth.tokenV2;
		config.auth.session = auth.session;
	}

	const hasAuth = !!(config.auth.tokenV2 && config.auth.session);

	debugState({ hasAuth });

	// Loading screen — establishes the page session via createStartUpPageContainer.
	// All subsequent SDK calls (rebuildPageContainer) depend on this having been called first.
	debugState({ status: 'loading' });
	// Cache duration: read from config, min 60s
	const cacheDurationMs = Math.max(60_000, config.cache.durationMs);

	// Core managers
	const authManager = new AuthManager(config.auth);
	const rateLimiter = new RateLimiter();
	const redditClient = new RedditClient(authManager, rateLimiter, config.api);
	const postStore = new PostStore(redditClient, cacheDurationMs);
	const uiManager = new UIManager();

	// Views
	const feedView = new FeedView(bridge);
	const detailView = new DetailView(bridge, config.api.baseUrl);
	const commentView = new CommentView(bridge);
	const menuView = new MenuView(bridge);

	// Wire the animation tick to the render schedule now that all views exist
	animTickFn = () => scheduleRender(bridge, postStore, uiManager, feedView, detailView, commentView, menuView);

	// Seed the active endpoint from the loaded config
	activeEndpoint = config.feed.endpoint;

	// Loading screen — establishes the page session via createStartUpPageContainer.
	// All subsequent SDK calls (rebuildPageContainer) depend on this having been called first.
	debugState({ status: 'loading' });
	await showStatus(bridge, 'Loading your feed...');

	startLoadAnim();

	// Reddit client init
	try {
		await redditClient.initialize();
		console.log('[RedditClient] Reddit client ready');
	} catch (e) {
		console.warn('[RedditClient] Reddit init warning:', e);
	}

	// ─── Event handler ────────────────────────────────────────────────────────

	bridge.onEvenHubEvent((event) => {
		const state = postStore.getState();
		if (state.loading || state.loadingMore || state.commentsLoading) {
			return;
		}

		const entry = uiManager.getCurrentEntry();
		const view = entry.view;

		// Resolve event type
		const type = event.textEvent?.eventType ?? event.sysEvent?.eventType ?? event.listEvent?.eventType;

		// Extract list event data if present
		const listEvent = event.listEvent;

		if (view === 'feed') {
			handleFeedEvent(type, postStore, uiManager);
		} else if (view === 'detail') {
			handleDetailEvent(type, postStore, uiManager, commentView);
		} else if (view === 'comments') {
			handleCommentsEvent(type, postStore, uiManager, commentView);
		} else if (view === 'menu') {
			handleMenuEvent(type, listEvent, postStore, uiManager);
		}
	});

	// ─── Subscriptions ────────────────────────────────────────────────────────

	postStore.subscribe(() => {
		const { loading, loadingMore, commentsLoading } = postStore.getState();

		if (!loading && !loadingMore && !commentsLoading) stopLoadAnim();

		scheduleRender(bridge, postStore, uiManager, feedView, detailView, commentView, menuView);
	});

	uiManager.subscribe(() => {
		const view = uiManager.getCurrentView();
		if (view !== 'comments') commentView.reset();

		scheduleRender(bridge, postStore, uiManager, feedView, detailView, commentView, menuView);
	});

	// ─── Load feed ────────────────────────────────────────────────────────────

	await postStore.loadFeed(config.feed);
	const finalState = postStore.getState();
	if (finalState.error) {
		debugState({ status: 'error', posts: 0, error: finalState.error });
	} else {
		debugState({ status: 'ready', posts: finalState.posts.length, error: null });
	}
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
			startLoadAnim();
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
			const currentEntry = uiManager.getCurrentEntry();
			uiManager.pushView({
				view: 'detail',
				postId: post.id,
				pageIndex: currentEntry.pageIndex,
				highlightIndex: currentEntry.highlightIndex,
			});
		}
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		const currentEntry = uiManager.getCurrentEntry();
		uiManager.pushView({
			view: 'menu',
			pageIndex: currentEntry.pageIndex,
			highlightIndex: currentEntry.highlightIndex,
			menuSelectedIndex: 0,
		});
	}
}

/**
 * Handle menu view events.
 *
 * ListContainerProperty sends listEvent with currentSelectItemIndex when the
 * firmware-managed highlight changes (scroll). We mirror that into UIManager.
 *   CLICK        → select highlighted endpoint, load feed, go back
 *   DOUBLE_CLICK → exit menu without changing anything
 */
function handleMenuEvent(
	type: OsEventTypeList | undefined,
	listEvent: { currentSelectItemIndex?: number; currentSelectItemName?: string } | undefined,
	postStore: PostStore,
	uiManager: UIManager,
): void {
	const entry = uiManager.getCurrentEntry();
	const currentIdx = entry.menuSelectedIndex ?? 0;

	// Mirror firmware list-scroll into our navigation context
	if (listEvent?.currentSelectItemIndex !== undefined) {
		uiManager.updateCurrentContext({ menuSelectedIndex: listEvent.currentSelectItemIndex });
	}

	if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
		// Use the firmware's reported index if available, otherwise our tracked one
		const idx = listEvent?.currentSelectItemIndex ?? currentIdx;
		const item = FEED_ITEMS[idx];
		if (item) {
			activeEndpoint = item.id;
			menuSelecting = true;
			postStore.loadFeedByEndpoint(item.id).catch(() => {});
			startLoadAnim();
			uiManager.goBack();
		}
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		uiManager.goBack();
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
			commentView.reset();
			commentView.setContext(post.subreddit, post.title);
			startLoadAnim();
			postStore.loadComments().catch(console.error);
			uiManager.pushView({ view: 'comments', postId: post.id });
		}
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		uiManager.goBack();
	}
	// Scroll events are consumed by text container for content scrolling
}

/**
 * Handle comments view events.
 * All double-scroll logic lives in CommentView; this function just delegates.
 */
function handleCommentsEvent(
	type: OsEventTypeList | undefined,
	postStore: PostStore,
	uiManager: UIManager,
	commentView: CommentView,
): void {
	const { comments, hasMoreComments, commentsLoading } = postStore.getState();
	if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
		commentView.onScrollDown(comments, hasMoreComments, commentsLoading, () =>
			postStore.loadMoreComments().catch(console.error),
		);
	} else if (type === OsEventTypeList.SCROLL_TOP_EVENT) {
		commentView.onScrollUp(comments, hasMoreComments, commentsLoading);
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		commentView.reset();
		uiManager.goBack();
	}
}

// ─── Loading animation helpers ──────────────────────────────────────────────

/** Start a 500ms tick that increments animDots and calls animTickFn. Re-entrant: no-ops if already running. */
function startLoadAnim(): void {
	if (loadAnimInterval) return;
	animDots = 3;
	loadAnimInterval = setInterval(() => {
		animDots = (animDots + 1) % 4;
		animTickFn?.();
	}, LOAD_ANIM_MS);
}

/** Stop the loading animation and reset the dots counter. */
function stopLoadAnim(): void {
	if (loadAnimInterval) {
		clearInterval(loadAnimInterval);
		loadAnimInterval = null;
	}
	animDots = 3;
}

// ─── Render System ──────────────────────────────────────────────────────────

function scheduleRender(
	bridge: Bridge,
	postStore: PostStore,
	uiManager: UIManager,
	feedView: FeedView,
	detailView: DetailView,
	commentView: CommentView,
	menuView: MenuView,
): void {
	if (isRendering) {
		renderQueued = true;
		return;
	}
	doRender(bridge, postStore, uiManager, feedView, detailView, commentView, menuView);
}

function doRender(
	bridge: Bridge,
	postStore: PostStore,
	uiManager: UIManager,
	feedView: FeedView,
	detailView: DetailView,
	commentView: CommentView,
	menuView: MenuView,
): void {
	isRendering = true;
	render(bridge, postStore, uiManager, feedView, detailView, commentView, menuView)
		.catch((err) => console.error('[Render] Uncaught error:', err))
		.finally(() => {
			isRendering = false;
			if (renderQueued) {
				renderQueued = false;
				doRender(bridge, postStore, uiManager, feedView, detailView, commentView, menuView);
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
	menuView: MenuView,
): Promise<void> {
	const entry = uiManager.getCurrentEntry();
	const view = entry.view;
	const state = postStore.getState();
	if (view !== 'menu') menuSelecting = false;

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
					await showStatus(bridge, `Error: ${state.error}`, true);
					return;
				}
				if ((state.posts.length === 0 && !state.error) || state.loading) {
					await showStatus(bridge, `Loading your feed${'.'.repeat(animDots)}`);
					return;
				}
				await feedView.render(
					state.posts,
					state.currentPage,
					state.highlightedIndex ?? 0,
					state.hasMore,
					state.loadingMore,
					animDots,
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
				await commentView.render(state.comments, state.hasMoreComments, state.commentsLoading, animDots);
				break;

			case 'menu':
				if (menuSelecting) break; // skip rebuild — we're transitioning away
				menuSelecting = false;
				await menuView.render(activeEndpoint);
				break;
		}
	} catch (e) {
		console.error('[Render] Error:', e);
		try {
			await showStatus(bridge, `Error: ${e instanceof Error ? e.message : String(e)}`);
		} catch {
			/* ignore */
		}
	}
}
