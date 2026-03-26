/**
 * Feed View
 *
 * Shows 4 posts + 1 footer row using 5 TextContainerProperty instances.
 * The highlighted row gets borderWidth:1 to indicate selection.
 * Scroll is handled manually in main.ts: SCROLL_BOTTOM/TOP events
 * increment/decrement highlightedIndex in PostStore, triggering a full
 * rebuildPageContainer to update which container has the border.
 *
 * Layout (576 × 288 px):
 *   IDs 1-4: post rows  (height=64 px each, yPosition = (id-1) × 64)
 *   ID  5:   footer row (height=32 px, yPosition=256)
 *
 * Why 4 posts?
 *   LVGL line height ≈ 28-30 px. Each post shows 2 lines (sub+score / title).
 *   Min readable row = 64 px (56 px usable after 4px padding each side).
 *   5 posts × 64 px = 320 px > 288 px — doesn't fit.
 *   4 posts × 64 px = 256 px + 32 px footer = 288 px ✓
 *
 * containerTotalNum = 5 (always, even when a post slot is empty)
 * isEventCapture    = 1 on container ID 1 only (G2 gestures are global)
 *
 * Navigation:
 *   SCROLL_DOWN: move highlight down; at footer (index 4) → next page
 *   SCROLL_UP:   move highlight up; at index 0 → prev page
 *   CLICK:       open highlighted post, or trigger load-more if footer selected
 *   DOUBLE_CLICK: refresh feed
 */

import { EvenAppBridge, RebuildPageContainer, TextContainerProperty } from '@evenrealities/even_hub_sdk';
import { CachedPost } from '../../core/types';

export const POSTS_PER_PAGE = 4;

const POST_H = 64; // height of each post row (px);  4 × 64 = 256 px
const WIDTH = 576;
const FOOTER_Y = POSTS_PER_PAGE * POST_H; //           256 px
const FOOTER_H = 288 - FOOTER_Y; //                    32 px
const POST_PAD = 3; // padding inside each post row
const FOOTER_PAD = 2; // tighter padding for the narrow footer
const MAX_POST_TITLE_LEN = 60;

export class FeedView {
	private bridge: EvenAppBridge;

	constructor(bridge: EvenAppBridge) {
		this.bridge = bridge;
	}

	/**
	 * Render the full feed page.
	 *
	 * @param posts           All loaded posts
	 * @param pageIndex       Current page (0-based)
	 * @param highlightedIndex Which row is selected: 0-3 = post, 4 = footer
	 * @param hasMore         Whether more posts can be fetched
	 * @param loadingMore     Whether a load-more is in flight
	 */
	async render(
		posts: CachedPost[],
		pageIndex: number,
		highlightedIndex: number,
		hasMore: boolean,
		loadingMore: boolean,
	): Promise<void> {
		const startIdx = pageIndex * POSTS_PER_PAGE;
		const pagePosts = posts.slice(startIdx, startIdx + POSTS_PER_PAGE);
		const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));

		const containers: TextContainerProperty[] = [];

		// ── Post rows (0 – 3) ────────────────────────────────────────────────────
		for (let i = 0; i < POSTS_PER_PAGE; i++) {
			const post = pagePosts[i] ?? null;
			const selected = i === highlightedIndex;

			containers.push(
				new TextContainerProperty({
					xPosition: 0,
					yPosition: i * POST_H,
					width: WIDTH,
					height: POST_H,
					borderWidth: selected ? 1 : 0,
					borderColor: selected ? 15 : 0,
					borderRadius: selected ? 8 : 0,
					paddingLength: POST_PAD,
					containerID: i + 1,
					containerName: `post${i}`,
					isEventCapture: i === 0 && !loadingMore ? 1 : 0,
					content: post ? formatPost(post) : '',
				}),
			);
		}

		// ── load-more el (index 4) ─────────────────────────────────────
		const footerContent = buildFooter(loadingMore);
		const footerWidth = footerContent.length * 11;
		containers.push(
			new TextContainerProperty({
				xPosition: Math.floor((WIDTH - footerWidth) / 2),
				yPosition: FOOTER_Y,
				height: FOOTER_H,
				width: footerWidth,
				borderWidth: 0,
				borderColor: 0,
				paddingLength: FOOTER_PAD,
				containerID: POSTS_PER_PAGE + 1,
				containerName: 'footer',
				isEventCapture: 0,
				content: footerContent,
			}),
		);

		console.log(
			`[FeedView] render page=${pageIndex}/${totalPages} hl=${highlightedIndex} ` +
				`posts=${pagePosts.length} hasMore=${hasMore} loadingMore=${loadingMore}`,
		);

		const ok = await this.bridge.rebuildPageContainer(
			new RebuildPageContainer({
				containerTotalNum: POSTS_PER_PAGE + 1,
				textObject: containers,
			}),
		);

		console.log('[FeedView] rebuildPageContainer:', ok);
	}
}

// ── Content helpers ────────────────────────────────────────────────────────────

function formatPost(post: CachedPost): string {
	const score = fmtScore(post.score);
	const cmt = fmtNum(post.numComments);
	const line1 = `r/${post.subreddit}  [ ${score}↑  ${cmt}c ]`;
	const needsTruncate = post.title.length >= MAX_POST_TITLE_LEN;
	const title = needsTruncate ? post.title.substring(0, MAX_POST_TITLE_LEN) : post.title;

	const normTruncate = (s: string) => {
		const normStr = s.trim();
		if (!needsTruncate) return s;
		const last = normStr.at(-1);
		if (!last || /[a-zA-Z0-9]/.test(last)) return s + '…';
		return normStr.substring(0, normStr.length - 1) + '…';
	};

	return `  ${line1}\n  ${normTruncate(title)}`;
}

function buildFooter(loadingMore: boolean): string {
	if (loadingMore) return `╭──  Loading feed...  ──╮`;
	return `╭──  Scroll down to update ──╮`;
}

function fmtScore(n: number): string {
	if (!n || n <= 0) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function fmtNum(n: number): string {
	if (!n || n <= 0) return '0';
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}
