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

const CONFIG_KEY = 'reddit-feed-config';
const AUTH_KEY = 'reddit-feed-auth';

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

// ─── Abort controller (detail/comments loading) ──────────────────────────────
let activeAbortController: AbortController | null = null;

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

// ─── App Logic ──────────────────────────────────────────────────────────────

interface Views {
	feed: FeedView;
	detail: DetailView;
	comment: CommentView;
	menu: MenuView;
}

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

	// Cache duration: read from config, min 60s
	const cacheDurationMs = Math.max(60_000, config.cache.durationMs);

	// Core managers
	const authManager = new AuthManager(config.auth);
	const rateLimiter = new RateLimiter();
	const redditClient = new RedditClient(authManager, rateLimiter, config.api);
	const postStore = new PostStore(redditClient, cacheDurationMs);
	const uiManager = new UIManager();

	// Wire rate limit callback
	redditClient.setRateLimitCallback((seconds) => postStore.startRetryCountdown(seconds));

	// Views
	const views: Views = {
		feed: new FeedView(bridge),
		detail: new DetailView(bridge, config.api.baseUrl),
		comment: new CommentView(bridge),
		menu: new MenuView(bridge),
	};

	// Wire the animation tick to the render schedule now that all views exist
	animTickFn = () => scheduleRender(bridge, postStore, uiManager, views);

	// Seed the active endpoint from the loaded config
	activeEndpoint = config.feed.endpoint;

	// Loading screen
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

		// Resolve event type first so we can check before the guard
		const type = event.textEvent?.eventType ?? event.sysEvent?.eventType ?? event.listEvent?.eventType;
		const listEvent = event.listEvent;

		const entry = uiManager.getCurrentEntry();
		const view = entry.view;

		// While loading: pass DOUBLE_CLICK through in detail/comments so user can abort
		if (state.loading || state.loadingMore || state.commentsLoading) {
			if (type === OsEventTypeList.DOUBLE_CLICK_EVENT && (view === 'detail' || view === 'comments')) {
				console.log(`[Main] DOUBLE_CLICK abort on view=${view}`);
				activeAbortController?.abort();
				activeAbortController = null;
				views.comment.reset();
				uiManager.goBack();
			}
			return;
		}

		if (view === 'feed') {
			handleFeedEvent(type, postStore, uiManager, views.feed);
		} else if (view === 'detail') {
			handleDetailEvent(type, postStore, uiManager, views.comment);
		} else if (view === 'comments') {
			handleCommentsEvent(type, postStore, uiManager, views.comment);
		} else if (view === 'menu') {
			handleMenuEvent(type, listEvent, postStore, uiManager);
		}
	});

	// ─── Subscriptions ────────────────────────────────────────────────────────

	postStore.subscribe(() => {
		const { loading, loadingMore, commentsLoading } = postStore.getState();
		if (!loading && !loadingMore && !commentsLoading) stopLoadAnim();
		scheduleRender(bridge, postStore, uiManager, views);
	});

	uiManager.subscribe(() => {
		const view = uiManager.getCurrentView();
		if (view !== 'comments') views.comment.reset();
		if (view !== 'feed') views.feed.reset();
		if (view !== 'detail') views.detail.reset();
		scheduleRender(bridge, postStore, uiManager, views);
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

function handleFeedEvent(
	type: OsEventTypeList | undefined,
	postStore: PostStore,
	uiManager: UIManager,
	feedView: FeedView,
): void {
	const state = postStore.getState();
	const pagePosts = postStore.getCurrentPagePosts();

	if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
		feedView.onScrollDown(
			state.highlightedIndex,
			pagePosts,
			state.hasMore,
			(i) => postStore.setHighlight(i),
			() => {
				startLoadAnim();
				postStore.nextPage().catch(console.error);
			},
		);
	} else if (type === OsEventTypeList.SCROLL_TOP_EVENT) {
		feedView.onScrollUp(
			state.highlightedIndex,
			state.currentPage,
			(i) => postStore.setHighlight(i),
			() => postStore.prevPage(),
		);
	} else if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
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

function handleMenuEvent(
	type: OsEventTypeList | undefined,
	listEvent: { currentSelectItemIndex?: number; currentSelectItemName?: string } | undefined,
	postStore: PostStore,
	uiManager: UIManager,
): void {
	const entry = uiManager.getCurrentEntry();
	if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT || type === OsEventTypeList.SCROLL_TOP_EVENT) {
		// Firmware handles list highlighting.
		console.log(`[Main] Menu scrolled: ${type === OsEventTypeList.SCROLL_BOTTOM_EVENT ? 'bottom' : 'top'}`);
	} else if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
		// Preference: use the index informed by the glasses during the click
		const selectedIdx = listEvent?.currentSelectItemIndex ?? entry.menuSelectedIndex ?? 0;
		const selected = FEED_ITEMS[selectedIdx];
		if (selected) {
			activeEndpoint = selected.id;
			console.log(`[Main] Menu selecting: index=${selectedIdx} endpoint=${activeEndpoint}`);
			menuSelecting = true;
			postStore.prepareForNewLoad();
			postStore.loadFeedByEndpoint(activeEndpoint).catch(console.error);
			uiManager.reset();
			uiManager.updateCurrentContext({ pageIndex: 0, highlightIndex: 0 });
		}
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		uiManager.goBack();
	}
}

function handleDetailEvent(
	type: OsEventTypeList | undefined,
	postStore: PostStore,
	uiManager: UIManager,
	commentView: CommentView,
): void {
	if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
		const post = postStore.getHighlightedPost();
		if (post) {
			// Abort any pending detail load before navigating deeper
			activeAbortController?.abort();
			activeAbortController = new AbortController();
			commentView.reset();
			commentView.setContext(post.subreddit, post.title);
			startLoadAnim();
			uiManager.pushView({ view: 'comments', postId: post.id });
			postStore.loadComments(activeAbortController.signal).catch(console.error);
		}
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		// Also abort any pending (e.g. link preview update still in flight)
		activeAbortController?.abort();
		activeAbortController = null;
		uiManager.goBack();
	}
}

function handleCommentsEvent(
	type: OsEventTypeList | undefined,
	postStore: PostStore,
	uiManager: UIManager,
	commentView: CommentView,
): void {
	const { comments, hasMoreComments, commentsLoading } = postStore.getState();
	if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
		commentView.onScrollDown(comments, hasMoreComments, commentsLoading, () =>
			postStore.loadMoreComments(activeAbortController?.signal).catch(console.error),
		);
	} else if (type === OsEventTypeList.SCROLL_TOP_EVENT) {
		commentView.onScrollUp(comments, hasMoreComments, commentsLoading);
	} else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		activeAbortController?.abort();
		activeAbortController = null;
		commentView.reset();
		uiManager.goBack();
	}
}

// ─── Loading animation helpers ──────────────────────────────────────────────

function startLoadAnim(): void {
	if (loadAnimInterval) return;
	animDots = 3;
	loadAnimInterval = setInterval(() => {
		animDots = (animDots + 1) % 4;
		animTickFn?.();
	}, LOAD_ANIM_MS);
}

function stopLoadAnim(): void {
	if (loadAnimInterval) {
		clearInterval(loadAnimInterval);
		loadAnimInterval = null;
	}
	animDots = 3;
}

// ─── Render System ──────────────────────────────────────────────────────────

function scheduleRender(bridge: Bridge, postStore: PostStore, uiManager: UIManager, views: Views): void {
	if (isRendering) {
		renderQueued = true;
		return;
	}
	doRender(bridge, postStore, uiManager, views);
}

function doRender(bridge: Bridge, postStore: PostStore, uiManager: UIManager, views: Views): void {
	isRendering = true;
	render(bridge, postStore, uiManager, views)
		.catch((err) => console.error('[Render] Uncaught error:', err))
		.finally(() => {
			isRendering = false;
			if (renderQueued) {
				renderQueued = false;
				doRender(bridge, postStore, uiManager, views);
			}
		});
}

async function render(bridge: Bridge, postStore: PostStore, uiManager: UIManager, views: Views): Promise<void> {
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
				if (state.retryInSeconds !== null && state.retryInSeconds !== undefined) {
					await showStatus(bridge, `Rate Limited. Retrying in ${state.retryInSeconds}s...`, false);
					return;
				}
				if (state.error && state.posts.length === 0) {
					await showStatus(bridge, `Error: ${state.error}`, true);
					return;
				}
				// Robust check for loading hangs: if we have posts and we're not loading, force transition to feed view.
				if (state.posts.length === 0 || state.loading) {
					await showStatus(bridge, `Loading your feed${'.'.repeat(animDots)}`, false);
					return;
				}
				await views.feed.render(
					state.posts,
					state.currentPage,
					state.highlightedIndex,
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
				await views.detail.render(post, activeAbortController?.signal);
				break;
			}

			case 'comments':
				if (state.retryInSeconds !== null && state.retryInSeconds !== undefined) {
					await showStatus(bridge, `Rate Limited. Retrying in ${state.retryInSeconds}s...`, false);
					return;
				}
				await views.comment.render(state.comments, state.hasMoreComments, state.commentsLoading, animDots);
				break;

			case 'menu':
				if (menuSelecting) return;
				await views.menu.render(activeEndpoint);
				break;
		}
	} catch (e) {
		console.error('[Render] Error:', e);
		debugState({ error: String(e) });
	}
}
