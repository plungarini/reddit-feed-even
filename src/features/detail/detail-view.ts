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

import { EvenAppBridge, RebuildPageContainer, TextContainerProperty } from '@evenrealities/even_hub_sdk';
import { CachedPost } from '../../core/types';

const MAX_CHARS = 1000; // SDK limit for rebuild

export class DetailView {
	private readonly bridge: EvenAppBridge;
	private lastPostId: string | null = null;

	constructor(bridge: EvenAppBridge) {
		this.bridge = bridge;
	}

	/**
	 * Render post detail - single text container with scrollable content
	 */
	async render(post: CachedPost): Promise<void> {
		if (!post || !post.id) {
			console.error('[DetailView] Invalid post');
			return;
		}

		const postChanged = this.lastPostId !== post.id;
		this.lastPostId = post.id;

		const score = fmtScore(post.score);
		const comments = fmtNum(post.numComments);
		const headerHeight = 38;
		const header = new TextContainerProperty({
			xPosition: 0,
			yPosition: 0,
			width: 576,
			height: headerHeight,
			containerID: 1,
			paddingLength: 4,
			containerName: 'header',
			isEventCapture: 0,
			content: `  r/${post.subreddit}  [ ${score}↑  ${comments}c ]`,
		});

		const content = this.buildContent(post);
		console.log(`[DetailView] render post=${post.id} len=${content.length} changed=${postChanged}`);

		const detail = new TextContainerProperty({
			xPosition: 0,
			yPosition: headerHeight,
			width: 576,
			height: 288 - headerHeight,
			borderWidth: 1,
			borderColor: 5,
			borderRadius: 10,
			paddingLength: 12,
			containerID: 2,
			containerName: 'detail',
			isEventCapture: 1, // Captures scroll for content scrolling
			content,
		});

		const ok = await this.bridge.rebuildPageContainer(
			new RebuildPageContainer({
				containerTotalNum: 2,
				textObject: [header, detail],
			}),
		);

		console.log('[DetailView] rebuildPageContainer:', ok);
	}

	/**
	 * Build post content for display
	 * Format:
	 *   r/subreddit  ^score  c:comments
	 *
	 *   Title
	 *
	 *   [Body or content type indicator]
	 *
	 *   u/author • time ago
	 *
	 *   tap: comments  dbl: back
	 */
	private buildContent(post: CachedPost): string {
		const lines: string[] = [];
		// Title (may wrap)
		lines.push(post.title, '');

		// Body or content indicator
		if (post.contentType === 'self' && post.selftext) {
			const body = stripMarkdown(post.selftext);
			// Limit body to prevent overflow
			const truncated = body.length > 600 ? body.substring(0, 597) + '...' : body;
			lines.push(truncated);
		} else {
			let contentLabel = `[${post.contentType.toUpperCase()}]`;
			if (post.contentType === 'link') {
				contentLabel += ` ${extractDomain(post.url)}`;
			}
			lines.push(contentLabel);
		}

		// Footer: author, time
		lines.push('', `u/${post.author} • ${timeAgo(post.createdUtc)}`);

		return lines.join('\n').substring(0, MAX_CHARS);
	}
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtScore(n: number): string {
	if (!n || n <= 0) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function fmtNum(n: number): string {
	if (!n || n <= 0) return '0';
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
	return String(n);
}

function timeAgo(createdUtc: number): string {
	if (!createdUtc) return 'unknown';
	const secs = Math.floor(Date.now() / 1000) - createdUtc;
	if (secs < 60) return 'now';
	if (secs < 3600) return `${Math.floor(secs / 60)}m`;
	if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
	if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
	return `${Math.floor(secs / 604800)}w`;
}

function extractDomain(url: string): string {
	if (!url) return '';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url.substring(0, 30);
	}
}

function stripMarkdown(text: string): string {
	if (!text) return '';
	return text
		.replace(/\*\*(.+?)\*\*/g, '$1')
		.replace(/\*(.+?)\*/g, '$1')
		.replace(/__(.+?)__/g, '$1')
		.replace(/_(.+?)_/g, '$1')
		.replace(/~~(.+?)~~/g, '$1')
		.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s*/gm, '  ')
		.replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
