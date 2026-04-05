/**
 * Detail View - Content-Only Scrolling
 *
 * Displays single post content that scrolls via firmware.
 * NO post-to-post navigation - user must go back to feed to select different post.
 *
 * Layout:
 *   - Full-screen text container
 *   - Content includes: header (subreddit, score), title, body, footer
 *   - Firmware handles scrolling long content
 *   - Border around container for visual distinction
 *
 * Navigation:
 *   Scroll up/down         → scrolls content (firmware handled)
 *   Single tap (CLICK)     → go to comments
 *   Double tap             → back to feed
 */

import {
	EvenAppBridge,
	RebuildPageContainer,
	TextContainerProperty,
	TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';
import { loadLinkPreview, resolvePreviewApiBase, type LinkPreviewData } from '../../../api/link-preview';
import { CachedPost } from '../../../core/types';
import { BORDER_RADIUS, MAX_CREATE_LENGTH, MAX_UPGRADE_LENGTH } from '../../../shared/constants';
import { capitalizeText, fmtScore, fmtTimeAgo, getStringChunks, normalizeWebText } from '../../../shared/utils';

const LINK_MAX_LINE_LEN = 52;
const LINK_MAX_DESC_LEN = 200;

interface DetailViewDeps {
	loadLinkPreviewImpl?: typeof loadLinkPreview;
}

export class DetailView {
	private readonly bridge: EvenAppBridge;
	private readonly previewApiBase: string | null;
	private readonly loadLinkPreviewImpl: typeof loadLinkPreview;
	private lastPostId: string | null = null;
	private initializedPostId: string | null = null;
	private linkPreviewCache: Map<string, string[]> = new Map();
	private fetchingPostId: string | null = null;

	constructor(bridge: EvenAppBridge, proxyUrl: string, deps: DetailViewDeps = {}) {
		this.bridge = bridge;
		this.previewApiBase = resolvePreviewApiBase(proxyUrl);
		this.loadLinkPreviewImpl = deps.loadLinkPreviewImpl ?? loadLinkPreview;
	}

	reset(): void {
		this.lastPostId = null;
		this.initializedPostId = null;
		this.fetchingPostId = null;
	}

	/**
	 * Render post detail - single text container with scrollable content
	 */
	async render(post: CachedPost, signal?: AbortSignal): Promise<void> {
		if (!post?.id) {
			console.error('[DetailView] Invalid post');
			return;
		}
		if (signal?.aborted) return;

		const postChanged = this.lastPostId !== post.id;
		this.lastPostId = post.id;

		const score = fmtScore(post.score);
		const comments = fmtScore(post.numComments);
		const headerHeight = 38;
		const header = new TextContainerProperty({
			xPosition: 0,
			yPosition: 0,
			width: 576,
			height: headerHeight,
			containerID: 1,
			paddingLength: 5,
			containerName: 'header',
			isEventCapture: 0,
			content: ` r/${post.subreddit}  [ ${score} ↑  ${comments} c ]`,
		});

		const { content, trimmed } = await this.buildContent(post, 'create');
		if (signal?.aborted) {
			console.log('[DetailView] render aborted after buildContent');
			return;
		}

		if (this.initializedPostId === post.id) {
			console.log('[DetailView] Post already initialized, skipping rebuild');
			if (post.contentType === 'link' && !this.linkPreviewCache.has(post.id)) {
				this.startPreviewLoad(post, signal);
			}
			return;
		}

		console.log(`[DetailView] render post=${post.id} len=${content.length} trimmed=${trimmed} changed=${postChanged}`);

		const detail = new TextContainerProperty({
			xPosition: 0,
			yPosition: headerHeight,
			width: 576,
			height: 288 - headerHeight,
			borderWidth: 1,
			borderColor: 5,
			borderRadius: BORDER_RADIUS,
			paddingLength: 10,
			containerID: 2,
			containerName: 'detail',
			isEventCapture: 1,
			content,
		});

		try {
			const ok = await this.bridge.rebuildPageContainer(
				new RebuildPageContainer({
					containerTotalNum: 2,
					textObject: [header, detail],
				}),
			);
			console.log('[DetailView] rebuildPageContainer:', ok);
			if (!ok) throw new Error('rebuildPageContainer returned false (detail)');
			if (signal?.aborted) return;

			this.initializedPostId = post.id;

			if (trimmed) {
				await this.updateContent(post, 'contentLen', signal);
			}

			if (post.contentType === 'link' && !signal?.aborted) {
				this.startPreviewLoad(post, signal);
			}
		} catch (error) {
			console.error('[DetailView] rebuildPageContainer failed', error);
		}
	}

	async updateContent(post: CachedPost, mode: 'contentLen' | 'update', signal?: AbortSignal) {
		if (signal?.aborted) return;
		if (!this.isPostActive(post.id)) return;

		const { content } = await this.buildContent(post, mode);
		if (signal?.aborted) {
			console.log('[DetailView] updateContent aborted after buildContent');
			return;
		}
		console.log(`[DetailView] updateContent post=${post.id} mode=${mode} len=${content.length}`);

		try {
			const container = new TextContainerUpgrade({
				containerID: 2,
				containerName: 'detail',
				contentLength: content.length,
				contentOffset: 0,
				content,
			});
			const ok = await this.bridge.textContainerUpgrade(container);
			console.log('[DetailView] textContainerUpgrade:', ok);
			if (!ok) throw new Error('textContainerUpgrade returned false (detail)');
		} catch (error) {
			console.error('[DetailView] textContainerUpgrade failed', error);
		}
	}

	/**
	 * Build post content for display
	 */
	private async buildContent(
		post: CachedPost,
		mode: 'create' | 'contentLen' | 'update',
	): Promise<{ content: string; trimmed: boolean }> {
		const CHARS_LIMIT = ['update', 'contentLen'].includes(mode) ? MAX_UPGRADE_LENGTH : MAX_CREATE_LENGTH;

		let totalChars = 0;
		let trimmed = false;
		const lines: string[] = [];

		lines.push(post.title);
		totalChars += post.title.length;

		const attachmentLines = await this.buildAttachments(post, mode);

		const attachmentContent = attachmentLines.join('\n');
		const footerContent = `\nu/${post.author} • ${fmtTimeAgo(post.createdUtc)}\n`;
		totalChars += attachmentContent.length + footerContent.length;

		if (post.selftext) {
			const remainingChars = CHARS_LIMIT - totalChars;
			const body = '───────────────────────────\n' + normalizeWebText(post.selftext);

			trimmed = body.length + lines.join('\n').length >= remainingChars;
			const truncated = trimmed ? body.substring(0, remainingChars - 50) + '…' : body;
			lines.push(truncated);
		}

		lines.push(attachmentContent, footerContent);

		return { content: lines.join('\n'), trimmed };
	}

	private async buildAttachments(post: CachedPost, mode: 'create' | 'contentLen' | 'update'): Promise<string[]> {
		if (post.contentType === 'self') return [];

		const attachmentLines = [''];
		if (post.contentType === 'link') {
			const cached = this.linkPreviewCache.get(post.id);
			if (cached) {
				attachmentLines.push(...cached);
			} else {
				attachmentLines.push(`╭─────────────────────────╮\n│    Loading Link Preview…\n╰─────────────────────────╯`);
			}
		} else {
			const contentLabel = `╭─────────────────────────╮\n│    ${capitalizeText(post.contentType)} Attachment\n╰─────────────────────────╯`;
			attachmentLines.push(contentLabel);
		}

		return attachmentLines;
	}

	private startPreviewLoad(post: CachedPost, signal?: AbortSignal): void {
		if (signal?.aborted) return;
		if (this.linkPreviewCache.has(post.id)) return;
		if (this.fetchingPostId === post.id) return;

		this.fetchingPostId = post.id;
		void this.loadAndApplyPreview(post, signal);
	}

	private async loadAndApplyPreview(post: CachedPost, signal?: AbortSignal): Promise<void> {
		try {
			const preview = await this.loadLinkPreviewImpl(post.url, this.previewApiBase, { signal });
			if (signal?.aborted || !this.isPostActive(post.id)) return;

			this.linkPreviewCache.set(post.id, buildLinkPreviewLines(preview));
			await this.updateContent(post, 'update', signal);
		} catch (error) {
			if (signal?.aborted || !this.isPostActive(post.id)) return;
			console.error('[DetailView] Failed to build link preview:', error);
			this.linkPreviewCache.set(post.id, [`╭─────────────────────────╮\n│    Link Preview Failed\n╰─────────────────────────╯`]);
			await this.updateContent(post, 'update', signal);
		} finally {
			if (this.fetchingPostId === post.id) {
				this.fetchingPostId = null;
			}
		}
	}

	private isPostActive(postId: string): boolean {
		return this.lastPostId === postId && this.initializedPostId === postId;
	}
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function buildLinkPreviewLines({ domain, title, description }: LinkPreviewData): string[] {
	const lines: string[] = [];
	let contentLabel = `╭─────────────────────────╮\n│    Link to ${domain}\n╰─────────────────────────╯`;

	if (title) {
		const titleParts = getStringChunks(title, LINK_MAX_LINE_LEN).map((t) => `│ ${t}`);

		lines.push(`╭─────────────────────────╮`, ...titleParts);
		contentLabel = `│\n╰  ${domain} ╯`;
	}
	if (description) {
		const normDescription =
			description.length > LINK_MAX_DESC_LEN
				? description.trim().substring(0, LINK_MAX_DESC_LEN - 3) + '…'
				: description.trim();
		const descriptionChunks = getStringChunks(normDescription, LINK_MAX_LINE_LEN).map(
			(d, i) => `│ ${i === 0 ? '> ' : ''}${d}`,
		);
		lines.push('│', ...descriptionChunks);
	}

	lines.push(contentLabel);
	return lines;
}
