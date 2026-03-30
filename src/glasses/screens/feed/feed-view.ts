import {
	EvenAppBridge,
	RebuildPageContainer,
	TextContainerProperty,
	TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import { CachedPost } from '../../../core/types';
import { BORDER_RADIUS } from '../../../shared/constants';
import { fmtScore, normalizeWebText } from '../../../shared/utils';

export const POSTS_PER_PAGE = 4;
export const FOOTER_CONTAINER_ID = POSTS_PER_PAGE + 1; // 5

const POST_H = 64;
const WIDTH = 576;
const HEIGHT = 288;
const FOOTER_Y = POSTS_PER_PAGE * POST_H;
const FOOTER_H = 32;
const MAX_POST_TITLE_LEN = 56;

// ─── Double-scroll config ─────────────────────────────────────────────────────
const DOUBLE_SCROLL_MS = 2000;
type ScrollPrimed = 'none' | 'down' | 'up';

export class FeedView {
	private readonly bridge: EvenAppBridge;

	// Double-scroll state machine (mirrors CommentView)
	private scrollPrimed: ScrollPrimed = 'none';
	private scrollPrimedAt = 0;
	private scrollPrimedTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(bridge: EvenAppBridge) {
		this.bridge = bridge;
	}

	reset(): void {
		this._resetScrollPrimed();
	}

	isScrollPrimed(): boolean {
		return this.scrollPrimed !== 'none';
	}

	// ─── Double-scroll handlers (called from main.ts) ─────────────────────────

	/**
	 * Call on SCROLL_BOTTOM_EVENT.
	 * - Within the page: moves highlight down.
	 * - At last post of page: first scroll shows "scroll again ⇒ next page" hint;
	 *   second scroll within 2s triggers onNextPage().
	 */
	onScrollDown(
		highlightedIndex: number,
		pagePosts: CachedPost[],
		hasMore: boolean,
		setHighlight: (i: number) => void,
		onNextPage: () => void,
	): void {
		const lastIndex = Math.max(0, pagePosts.length - 1);
		const atLastPost = highlightedIndex >= lastIndex;

		if (!atLastPost) {
			// Normal navigation within page
			this._resetScrollPrimed();
			setHighlight(highlightedIndex + 1);
			return;
		}

		// At last post — either we have more pages or we're at the real end
		if (!hasMore && pagePosts.length < POSTS_PER_PAGE) {
			// No more content at all — nothing to do
			return;
		}

		const now = Date.now();
		if (this.scrollPrimed === 'down' && now - this.scrollPrimedAt <= DOUBLE_SCROLL_MS) {
			// Confirmed — load next page
			console.log('[FeedView] Double-scroll ↓ confirmed → next page');
			this._resetScrollPrimed();
			this._updateFooter(buildFooter(false, false, 3));
			onNextPage();
		} else {
			// First scroll — show hint
			console.log('[FeedView] Double-scroll ↓ primed');
			this._resetScrollPrimed();
			this.scrollPrimed = 'down';
			this.scrollPrimedAt = now;
			this._armResetTimer();
			this._updateFooter(buildFooter(false, true, 3));
		}
	}

	/**
	 * Call on SCROLL_TOP_EVENT.
	 * - Within page: moves highlight up.
	 * - At first post of page (and not page 0): double-scroll goes to prev page.
	 */
	onScrollUp(
		highlightedIndex: number,
		currentPage: number,
		setHighlight: (i: number) => void,
		onPrevPage: () => void,
	): void {
		const atFirstPost = highlightedIndex === 0;

		if (!atFirstPost) {
			// Normal navigation within page
			this._resetScrollPrimed();
			setHighlight(highlightedIndex - 1);
			return;
		}

		if (currentPage === 0) {
			// Already on first page, first post — nothing to do
			return;
		}

		// Go to prev page instantly
		console.log('[FeedView] Scroll ↑ → prev page');
		this._resetScrollPrimed();
		this._updateFooter(buildFooter(false, false, 3));
		onPrevPage();
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	/**
	 * Render the full feed page via rebuildPageContainer.
	 * Requires createStartUpPageContainer to have been called first (via showStatus loading screen).
	 */
	async render(
		posts: CachedPost[],
		pageIndex: number,
		highlightedIndex: number,
		hasMore: boolean,
		loadingMore: boolean,
		dotsCount = 3,
	): Promise<void> {
		const containers = this.buildContainers(posts, pageIndex, highlightedIndex, hasMore, loadingMore, dotsCount);

		const rebuildParam = new RebuildPageContainer({
			containerTotalNum: containers.length,
			textObject: containers,
		});

		try {
			const ok = await this.bridge.rebuildPageContainer(rebuildParam);
			if (!ok) {
				throw new Error('rebuildPageContainer returned false (feed)');
			}

			// After a full rebuild, if primed, re-render the footer hint so it survives the rebuild
			if (this.scrollPrimed !== 'none') {
				const hintText = buildFooter(false, true, dotsCount);
				this._updateFooter(hintText);
			}
		} catch (error) {
			console.error('rebuildPageContainer failed (feed)', error);
		}
	}

	// ─── Private helpers ──────────────────────────────────────────────────────

	private buildContainers(
		posts: CachedPost[],
		pageIndex: number,
		highlightedIndex: number,
		hasMore: boolean,
		loadingMore: boolean,
		dotsCount = 3,
	): TextContainerProperty[] {
		const startIdx = pageIndex * POSTS_PER_PAGE;
		const pagePosts = posts.slice(startIdx, startIdx + POSTS_PER_PAGE);
		const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));

		const containers: TextContainerProperty[] = [
			// ── Invisible Event Shield ─────────────────────────────────────────
			new TextContainerProperty({
				xPosition: 0,
				yPosition: 0,
				width: WIDTH,
				height: HEIGHT,
				isEventCapture: loadingMore ? 0 : 1,
				content: '',
				containerID: POSTS_PER_PAGE + 2,
				containerName: 'event_shield',
			}),
		];

		// ── Post rows (0 – 3) ────────────────────────────────────────────────────
		for (let i = 0; i < POSTS_PER_PAGE; i++) {
			const post = pagePosts[i] ?? null;
			const selected = i === highlightedIndex;

			containers.push(
				new TextContainerProperty({
					xPosition: 0,
					yPosition: i * POST_H,
					width: WIDTH,
					height: POST_H + 5,
					borderWidth: selected ? 1 : 0,
					borderColor: selected ? 15 : 0,
					borderRadius: selected ? BORDER_RADIUS - 2 : 0,
					paddingLength: selected ? 4 : 5,
					containerID: i + 1,
					containerName: `post${i}`,
					isEventCapture: 0,
					content: post ? formatPost(post) : '',
				}),
			);
		}

		// ── Footer (index 4) — always full-width for event capture ────────────
		const footerContent = buildFooter(loadingMore, this.scrollPrimed !== 'none', dotsCount);
		const footerWidth = footerContent.length * 11;

		containers.push(
			new TextContainerProperty({
				xPosition: Math.floor((WIDTH - footerWidth) / 2),
				yPosition: FOOTER_Y,
				height: FOOTER_H,
				width: footerWidth + 20,
				borderWidth: 0,
				borderColor: 0,
				paddingLength: 2,
				containerID: POSTS_PER_PAGE + 1,
				containerName: 'footer',
				isEventCapture: 0,
				content: footerContent,
			}),
		);

		console.log(
			`[FeedView] buildContainers page=${pageIndex}/${totalPages} hl=${highlightedIndex} ` +
				`posts=${pagePosts.length} hasMore=${hasMore} loadingMore=${loadingMore} primed=${this.scrollPrimed}`,
		);

		return containers;
	}

	/** Update only the footer text container via textContainerUpgrade */
	private _updateFooter(text: string): void {
		this.bridge
			.textContainerUpgrade(
				new TextContainerUpgrade({
					containerID: FOOTER_CONTAINER_ID,
					containerName: 'footer',
					contentOffset: 0,
					contentLength: text.length,
					content: text,
				}),
			)
			.then((ok) => {
				if (!ok) console.warn('[FeedView] upgradeFooter returned false');
			})
			.catch((err) => console.error('[FeedView] upgradeFooter failed:', err));
	}

	// ─── Scroll state machine helpers ─────────────────────────────────────────

	private _resetScrollPrimed(): void {
		this.scrollPrimed = 'none';
		this.scrollPrimedAt = 0;
		if (this.scrollPrimedTimer) {
			clearTimeout(this.scrollPrimedTimer);
			this.scrollPrimedTimer = null;
		}
	}

	private _armResetTimer(): void {
		if (this.scrollPrimedTimer) clearTimeout(this.scrollPrimedTimer);
		this.scrollPrimedTimer = setTimeout(() => {
			this.scrollPrimedTimer = null;
			this._resetScrollPrimed();
			// Restore default footer
			this._updateFooter(buildFooter(false, false, 3));
		}, DOUBLE_SCROLL_MS);
	}
}

// ── Content helpers ────────────────────────────────────────────────────────────

function formatPost(post: CachedPost): string {
	const score = fmtScore(post.score);
	const cmt = fmtScore(post.numComments);
	const line1 = normalizeWebText(`r/${post.subreddit}  [ ${score} ↑  ${cmt} c ]`);
	const needsTruncate = post.title.length >= MAX_POST_TITLE_LEN;
	const title = needsTruncate ? post.title.substring(0, MAX_POST_TITLE_LEN - 1) : post.title;

	const normTruncate = (s: string) => {
		const normStr = `> ${s.trim()}`;
		if (!needsTruncate) return normalizeWebText(normStr);
		const last = normStr.at(-1);
		if (!last || /[a-zA-Z0-9]/.test(last)) return normalizeWebText(normStr + '…');
		return normalizeWebText(normStr.substring(0, normStr.length - 1) + '…');
	};

	return ` ${line1}\n ${normTruncate(title)}`;
}

function buildFooter(loadingMore: boolean, primed: boolean, dotsCount = 3): string {
	if (loadingMore) return `╭──  Loading feed${'.'.repeat(dotsCount)}  ──╮`;
	if (primed) return `╭──  ↓ again → next page  ──╮`;
	return `╭──  Scroll down to update  ──╮`;
}
