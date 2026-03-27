import { EvenAppBridge, RebuildPageContainer, TextContainerProperty } from '@evenrealities/even_hub_sdk';
import { CachedPost } from '../../core/types';

export const POSTS_PER_PAGE = 4;
/** containerID of the footer row; event_shield is FOOTER_CONTAINER_ID + 1 */
export const FOOTER_CONTAINER_ID = POSTS_PER_PAGE + 1; // 5

const POST_H = 64; // height of each post row (px);  4 × 64 = 256 px
const WIDTH = 576;
const FOOTER_Y = POSTS_PER_PAGE * POST_H; //           256 px
const FOOTER_H = 288 - FOOTER_Y; //                    32 px
const POST_PAD = 3; // padding inside each post row
const FOOTER_PAD = 2; // tighter padding for the narrow footer
const MAX_POST_TITLE_LEN = 56;

export class FeedView {
	private readonly bridge: EvenAppBridge;

	constructor(bridge: EvenAppBridge) {
		this.bridge = bridge;
	}

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
	): Promise<void> {
		const containers = this.buildContainers(posts, pageIndex, highlightedIndex, hasMore, loadingMore);

		const rebuildParam = new RebuildPageContainer({
			containerTotalNum: containers.length,
			textObject: containers,
		});

		try {
			const ok = await this.bridge.rebuildPageContainer(rebuildParam);
			if (!ok) {
				throw new Error('rebuildPageContainer returned false (feed)');
			}
		} catch (error) {
			console.error('rebuildPageContainer failed (feed)', error);
		}
	}

	private buildContainers(
		posts: CachedPost[],
		pageIndex: number,
		highlightedIndex: number,
		hasMore: boolean,
		loadingMore: boolean,
	): TextContainerProperty[] {
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
					isEventCapture: 0,
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

		// ── Invisible Event Shield (index 5) ───────────────────────────
		containers.push(
			new TextContainerProperty({
				xPosition: 0,
				yPosition: 0,
				width: WIDTH,
				height: 288,
				isEventCapture: loadingMore ? 0 : 1,
				content: '',
				containerID: POSTS_PER_PAGE + 2,
				containerName: 'event_shield',
			}),
		);

		console.log(
			`[FeedView] buildContainers page=${pageIndex}/${totalPages} hl=${highlightedIndex} ` +
				`posts=${pagePosts.length} hasMore=${hasMore} loadingMore=${loadingMore}`,
		);

		return containers;
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
		if (!needsTruncate) return normStr;
		const last = normStr.at(-1);
		if (!last || /[a-zA-Z0-9]/.test(last)) return normStr + '…';
		return normStr.substring(0, normStr.length - 1) + '…';
	};

	return `  ${line1}\n  > ${normTruncate(title)}`;
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
