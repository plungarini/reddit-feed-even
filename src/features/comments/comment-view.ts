import {
	EvenAppBridge,
	RebuildPageContainer,
	TextContainerProperty,
	TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import { oneLine } from 'common-tags';
import { RedditComment } from '../../core/types';
import { BORDER_RADIUS } from '../../shared/constants';
import { fmtScore, fmtTimeAgo, getStringChunks, normalizeWebText } from '../../shared/utils';

// ─── Layout ───────────────────────────────────────────────────────────────────
const WIDTH = 576;
const HEADER_H = 38;
const BODY_Y = HEADER_H;
const BODY_H = 288 - HEADER_H;
const MAX_LINE_LEN = 55;
const MAX_PAGE_CHARS = 900;
const COMMENTS_PER_PAGE = 10;

// ─── Double-scroll config ─────────────────────────────────────────────────────
const DOUBLE_SCROLL_MS = 2000;
type ScrollPrimed = 'none' | 'down' | 'up';

export class CommentView {
	private readonly bridge: EvenAppBridge;

	// Slice / pagination
	private pageIndex = 0;
	private totalPages = 0;
	private totalComments = 0;

	// Context for header
	private subreddit = '';

	// Render state — set BEFORE the first await to prevent race conditions
	private initialized = false;
	private rendering = false; // render lock
	private renderQueued = false;
	private lastBodyContent = '';
	private lastHeaderContent = '';

	// Scroll hint (shown in header while primed)
	private scrollHint = '';

	// Double-scroll state machine
	private scrollPrimed: ScrollPrimed = 'none';
	private scrollPrimedAt = 0;
	private scrollPrimedTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(bridge: EvenAppBridge) {
		this.bridge = bridge;
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	reset(): void {
		this.pageIndex = 0;
		this.totalPages = 0;
		this.totalComments = 0;
		this.subreddit = '';
		this.initialized = false;
		this.rendering = false;
		this.renderQueued = false;
		this.lastBodyContent = '';
		this.lastHeaderContent = '';
		this.scrollHint = '';
		this._resetScrollPrimed();
	}

	setContext(subreddit: string, _postTitle: string): void {
		this.subreddit = subreddit;
	}

	// ─── Double-scroll event handlers (called directly from main.ts) ──────────

	/**
	 * Call on SCROLL_BOTTOM_EVENT.
	 * First call primes the hint; second call within the window changes page.
	 * loadMore is called when advancing past the last page.
	 */
	onScrollDown(comments: RedditComment[], hasMore: boolean, loading: boolean, loadMore: () => void): void {
		const now = Date.now();
		const atLastPage = this.pageIndex >= this.totalPages - 1;

		// Suppress hint if already on last page
		if (atLastPage && this.scrollPrimed !== 'down') {
			if (hasMore && !loading) loadMore();
			return;
		}

		if (this.scrollPrimed === 'down' && now - this.scrollPrimedAt <= DOUBLE_SCROLL_MS) {
			// Confirmed — advance page
			console.log('[CommentView] Double-scroll ↓ confirmed → next page');
			this._resetScrollPrimed();
			this.pageIndex++;
			this.render(comments, hasMore, loading).catch(console.error);
		} else {
			// First scroll — show hint
			console.log('[CommentView] Double-scroll ↓ primed');
			this._resetScrollPrimed();
			this.scrollPrimed = 'down';
			this.scrollPrimedAt = now;
			this.scrollHint = '↓ again → next';
			this._armResetTimer(comments, hasMore, loading);
			this.render(comments, hasMore, loading).catch(console.error);
		}
	}

	/**
	 * Call on SCROLL_TOP_EVENT.
	 * Same double-scroll logic, going backwards.
	 */
	onScrollUp(comments: RedditComment[], hasMore: boolean, loading: boolean): void {
		const now = Date.now();
		const atFirstPage = this.pageIndex === 0;

		// Suppress hint if already on first page
		if (atFirstPage && this.scrollPrimed !== 'up') return;

		if (this.scrollPrimed === 'up' && now - this.scrollPrimedAt <= DOUBLE_SCROLL_MS) {
			// Confirmed — go back
			console.log('[CommentView] Double-scroll ↑ confirmed → prev page');
			this._resetScrollPrimed();
			if (this.pageIndex > 0) this.pageIndex--;
			this.render(comments, hasMore, loading).catch(console.error);
		} else {
			// First scroll — show hint
			console.log('[CommentView] Double-scroll ↑ primed');
			this._resetScrollPrimed();
			this.scrollPrimed = 'up';
			this.scrollPrimedAt = now;
			this.scrollHint = '↑ again → prev';
			this._armResetTimer(comments, hasMore, loading);
			this.render(comments, hasMore, loading).catch(console.error);
		}
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	async render(comments: RedditComment[], hasMore: boolean, loading: boolean, dotsCount = 0): Promise<void> {
		if (this.rendering) {
			this.renderQueued = true;
			return;
		}
		this.rendering = true;

		try {
			const topComments = comments.filter((c) => (c.depth ?? 0) === 0);
			this.totalComments = topComments.length;
			this.totalPages = Math.max(1, Math.ceil(topComments.length / COMMENTS_PER_PAGE));
			if (this.pageIndex >= this.totalPages) this.pageIndex = this.totalPages - 1;

			const headerText = this.buildHeader(loading);
			const bodyText = this.buildBody(topComments, loading, dotsCount);
			const headerChanged = headerText !== this.lastHeaderContent;
			const bodyChanged = bodyText !== this.lastBodyContent;

			console.log(
				`[CommentView] render p=${this.pageIndex}/${this.totalPages} ` +
					`len=${bodyText.length} init=${this.initialized} bodyChanged=${bodyChanged}`,
			);

			if (!this.initialized) {
				// Mark initialized BEFORE the await to block concurrent renders
				this.initialized = true;
				this.lastHeaderContent = headerText;
				this.lastBodyContent = bodyText;
				await this.fullRebuild(headerText, bodyText);
			} else if (bodyChanged) {
				this.lastBodyContent = bodyText;
				await this.upgradeBody(bodyText);
				if (headerChanged) {
					this.lastHeaderContent = headerText;
					await this.upgradeHeader(headerText);
				}
			} else if (headerChanged) {
				this.lastHeaderContent = headerText;
				await this.upgradeHeader(headerText);
			}
		} finally {
			this.rendering = false;
			if (this.renderQueued) {
				this.renderQueued = false;
				this.render(comments, hasMore, loading, dotsCount).catch(console.error);
			}
		}
	}

	// ─── Private: build content ───────────────────────────────────────────────

	private buildHeader(loading: boolean): string {
		if (!this.initialized || (loading && this.totalComments === 0)) {
			return ` Comments`;
		}
		const page = `[ ${this.pageIndex + 1} / ${this.totalPages} ]`;
		const hint = this.scrollHint ? `                                           ${this.scrollHint}` : '';
		return ` Comments    ${page}${hint}`;
	}

	private buildBody(topComments: RedditComment[], loading: boolean, dotsCount = 0): string {
		if (loading && topComments.length === 0) return `Loading comments${'.'.repeat(dotsCount)}`;
		if (topComments.length === 0) return 'Failed to load comments.';

		const startIdx = this.pageIndex * COMMENTS_PER_PAGE;
		const slice = topComments.slice(startIdx, startIdx + COMMENTS_PER_PAGE);
		if (slice.length === 0) return 'No comments on this page.';

		let content = '';
		const maxLen = this.initialized ? 1900 : 900;

		for (const c of slice) {
			const block = formatBlock(c);
			if (content.length + block.length > maxLen) break;
			content += block + '\n\n';
		}

		return content;
	}

	// ─── Private: SDK calls ───────────────────────────────────────────────────

	private async fullRebuild(header: string, body: string): Promise<void> {
		const headerContainer = new TextContainerProperty({
			xPosition: 0,
			yPosition: 0,
			width: WIDTH,
			height: HEADER_H,
			borderWidth: 0,
			paddingLength: 5,
			containerID: 1,
			containerName: 'cmt-hdr',
			isEventCapture: 0,
			content: header,
		});
		const bodyContainer = new TextContainerProperty({
			xPosition: 0,
			yPosition: BODY_Y,
			width: WIDTH,
			height: BODY_H,
			borderWidth: 1,
			borderColor: 5,
			borderRadius: BORDER_RADIUS,
			paddingLength: 10,
			containerID: 2,
			containerName: 'cmt-body',
			isEventCapture: 1,
			content: body.slice(0, 999),
		});
		try {
			const ok = await this.bridge.rebuildPageContainer(
				new RebuildPageContainer({ containerTotalNum: 2, textObject: [headerContainer, bodyContainer] }),
			);
			if (!ok) throw new Error('rebuildPageContainer returned false (comments)');
		} catch (err) {
			console.error('[CommentView] fullRebuild failed:', err);
		}
	}

	private async upgradeBody(content: string): Promise<void> {
		try {
			const ok = await this.bridge.textContainerUpgrade(
				new TextContainerUpgrade({
					containerID: 2,
					containerName: 'cmt-body',
					contentOffset: 0,
					contentLength: content.length,
					content: content.slice(0, 1999),
				}),
			);
			if (!ok) console.warn('[CommentView] upgradeBody returned false');
		} catch (err) {
			console.error('[CommentView] upgradeBody failed:', err);
		}
	}

	private async upgradeHeader(content: string): Promise<void> {
		try {
			const ok = await this.bridge.textContainerUpgrade(
				new TextContainerUpgrade({
					containerID: 1,
					containerName: 'cmt-hdr',
					contentOffset: 0,
					contentLength: content.length,
					content,
				}),
			);
			if (!ok) console.warn('[CommentView] upgradeHeader returned false');
		} catch (err) {
			console.warn('[CommentView] upgradeHeader failed:', err);
		}
	}

	// ─── Private: scroll state machine helpers ────────────────────────────────

	private _resetScrollPrimed(): void {
		this.scrollPrimed = 'none';
		this.scrollPrimedAt = 0;
		this.scrollHint = '';
		if (this.scrollPrimedTimer) {
			clearTimeout(this.scrollPrimedTimer);
			this.scrollPrimedTimer = null;
		}
	}

	private _armResetTimer(comments: RedditComment[], hasMore: boolean, loading: boolean): void {
		if (this.scrollPrimedTimer) clearTimeout(this.scrollPrimedTimer);
		this.scrollPrimedTimer = setTimeout(() => {
			this.scrollPrimedTimer = null;
			this._resetScrollPrimed();
			// Re-render to clear the hint from the header
			this.render(comments, hasMore, loading).catch(console.error);
		}, DOUBLE_SCROLL_MS);
	}
}

// ─── Comment formatting ───────────────────────────────────────────────────────

function formatBlock(comment: RedditComment): string {
	const score = fmtScore(comment.score);
	const age = fmtTimeAgo(comment.createdUtc);
	const lines: string[] = [];

	lines.push(`u/${comment.author}  [ ${score} ↑  ${age} ]`);

	const body = normalizeWebText(comment.body);
	const chunks = getStringChunks(`> ${body}`, MAX_LINE_LEN);
	lines.push(...chunks.map((c) => oneLine(c)));

	const content = lines.join('\n').trimEnd();
	return content.length >= MAX_PAGE_CHARS ? content.substring(0, MAX_PAGE_CHARS - 5) + '…' : content;
}
