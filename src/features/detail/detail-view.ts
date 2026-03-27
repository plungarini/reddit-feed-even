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
import { normalizeWebText } from '../../shared/utils';

const MAX_CHARS = 1000; // SDK limit for rebuild

export class DetailView {
	private readonly bridge: EvenAppBridge;
	private readonly proxyUrl: string;
	private lastPostId: string | null = null;

	constructor(bridge: EvenAppBridge, proxyUrl?: string) {
		this.bridge = bridge;
		const host = (globalThis as any)?.location?.hostname || 'localhost';
		const defaultProxy = `http://${host}:3001/api`;
		this.proxyUrl = proxyUrl ? (proxyUrl.endsWith('/') ? proxyUrl.slice(0, -1) : proxyUrl) : defaultProxy;
		if (this.proxyUrl && !this.proxyUrl.endsWith('/api')) {
			this.proxyUrl = `${this.proxyUrl}/api`;
		}
	}

	/**
	 * Render post detail - single text container with scrollable content
	 */
	async render(post: CachedPost): Promise<void> {
		if (!post?.id) {
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

		const content = await this.buildContent(post);
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
		} catch (error) {
			console.error('[DetailView] rebuildPageContainer failed', error);
		}
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
	private async buildContent(post: CachedPost): Promise<string> {
		const lines: string[] = [];
		// Title (may wrap)
		lines.push(post.title);

		// Body or content indicator
		if (post.contentType === 'self' && post.selftext) {
			const body = '───────────────────────────\n' + normalizeWebText(post.selftext);
			const truncated = body.length > 600 ? body.substring(0, 597) + '...' : body;
			lines.push(truncated);
		} else {
			lines.push('');
			let contentLabel = `[${post.contentType.toUpperCase()}]`;
			if (post.contentType === 'link') {
				const { lines: linkLines, contentLabel: linkContentLabel } = await buildLinkPreview(post.url, this.proxyUrl);
				lines.push(...linkLines);
				contentLabel = linkContentLabel;
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

async function buildLinkPreview(url: string, proxyUrl: string): Promise<{ lines: string[]; contentLabel: string }> {
	const MAX_LINE_LEN = 52;
	const MAX_DESC_LEN = 200;

	const lines: string[] = [];
	let contentLabel = `[LINK]`;
	const { domain, title, description } = await extractLink(url, proxyUrl);
	contentLabel += ` ${domain}`;

	if (title) {
		const titleParts = getStringChunks(title, MAX_LINE_LEN).map((t) => `│ ${t}`);

		lines.push(`╭─────────────────────────╮`, ...titleParts);
		contentLabel = `│\n╰  ${domain} ╯`;
	}
	if (description) {
		const normDescription =
			description.length > MAX_DESC_LEN ? description.trim().substring(0, MAX_DESC_LEN - 3) + '…' : description.trim();
		const descriptionChunks = getStringChunks(normDescription, MAX_LINE_LEN).map(
			(d, i) => `│ ${i === 0 ? '> ' : ''}${d}`,
		);
		lines.push('│', ...descriptionChunks);
	}
	return { lines, contentLabel };
}

function getStringChunks(text: string, maxLength: number): string[] {
	if (!text) {
		return [];
	}

	const words = text.split(' ');
	const lines = [];
	let currentLine = '';

	for (const word of words) {
		if ((currentLine + word).length > maxLength) {
			if (currentLine === '') {
				lines.push(word.substring(0, maxLength));
				currentLine = word.substring(maxLength) + ' ';
			} else {
				lines.push(currentLine.trim());
				currentLine = word + ' ';
			}
		} else {
			currentLine += word + ' ';
		}
	}

	if (currentLine.trim()) {
		lines.push(currentLine.trim());
	}

	return lines;
}

async function extractLink(
	url: string,
	proxyUrl: string,
): Promise<{ domain: string; title?: string; description?: string }> {
	if (!url) return { domain: '' };
	try {
		const previewUrl = `${proxyUrl}/preview?url=${encodeURIComponent(url)}`;
		console.log(`[DetailView] Fetching preview: ${previewUrl}`);
		const response = await fetch(previewUrl, { signal: AbortSignal.timeout(10000) });
		if (response.ok) {
			const data = await response.json<{
				title?: string;
				description?: string;
				url: string;
			}>();
			console.log('[DetailView] Preview data:', { data });
			return {
				domain: new URL(url).hostname.replace(/^www\./, ''),
				title: data.title ? normalizeWebText(data.title) : undefined,
				description: data.description ? normalizeWebText(data.description) : undefined,
			};
		}
	} catch (e) {
		console.warn('[DetailView] Preview fetch failed:', e);
	}

	// Fallback
	try {
		return { domain: new URL(url).hostname.replace(/^www\./, '') };
	} catch {
		return { domain: url.substring(0, 30) };
	}
}
