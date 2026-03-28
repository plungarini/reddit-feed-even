import { EvenAppBridge, RebuildPageContainer, TextContainerProperty } from '@evenrealities/even_hub_sdk';
import { CachedPost } from '../../core/types';
import { BORDER_RADIUS } from '../../shared/constants';
import { fmtScore, normalizeWebText } from '../../shared/utils';

export const POSTS_PER_PAGE = 4;
export const FOOTER_CONTAINER_ID = POSTS_PER_PAGE + 1; // 5

const POST_H = 64;
const WIDTH = 576;
const FOOTER_Y = POSTS_PER_PAGE * POST_H;
const FOOTER_H = 288 - FOOTER_Y;
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
		dotsCount = 3,
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
					borderRadius: selected ? BORDER_RADIUS - 2 : 0,
					paddingLength: selected ? 4 : 5,
					containerID: i + 1,
					containerName: `post${i}`,
					isEventCapture: 0,
					content: post ? formatPost(post) : '',
				}),
			);
		}

		// ── load-more el (index 4) ─────────────────────────────────────
		const footerContent = buildFooter(loadingMore, dotsCount);
		const footerWidth = footerContent.length * 11;

		// ── Invisible Event Shield (index 5) ───────────────────────────

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
	const cmt = fmtScore(post.numComments);
	const line1 = normalizeWebText(`r/${post.subreddit}  [ ${score} ↑  ${cmt} c ]`);
	const needsTruncate = post.title.length >= MAX_POST_TITLE_LEN;
	const title = needsTruncate ? post.title.substring(0, MAX_POST_TITLE_LEN - 1) : post.title;

	const normTruncate = (s: string) => {
		const normStr = s.trim();
		if (!needsTruncate) return normalizeWebText(normStr);
		const last = normStr.at(-1);
		if (!last || /[a-zA-Z0-9]/.test(last)) return normalizeWebText(normStr + '…');
		return normalizeWebText(normStr.substring(0, normStr.length - 1) + '…');
	};

	return ` ${line1}\n > ${normTruncate(title)}`;
}

function buildFooter(loadingMore: boolean, dotsCount = 3): string {
	if (loadingMore) return `╭──  Loading feed…  ──╮`;
	return `╭──  Scroll down to update ──╮`;
}
