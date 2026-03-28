export function normalizeWebText(text: string): string {
	if (!text) {
		return '';
	}

	// HTML entities: decode to their plain-text equivalents
	const HTML_ENTITIES: Record<string, string> = {
		'&amp;': '&',
		'&lt;': '<',
		'&gt;': '>',
		'&quot;': '"',
		'&#39;': "'",
		'&#x27;': "'",
		'&#x2F;': '/',
		'&nbsp;': ' ',
	};

	return (
		text
			// HTML entities -> plain chars
			.replaceAll(/&[#a-z0-9]+;/gi, (match) => {
				if (HTML_ENTITIES[match]) return HTML_ENTITIES[match];

				// handle decimal numeric entities: &#039; &#39; etc.
				const decimal = new RegExp(/^&#(\d+);$/).exec(match);
				if (decimal) return String.fromCodePoint(Number.parseInt(decimal[1], 10));
				// handle hex numeric entities: &#x27; &#x2F; etc.
				const hex = new RegExp(/^&#x([0-9a-f]+);$/i).exec(match);
				if (hex) return String.fromCodePoint(Number.parseInt(hex[1], 16));

				return match;
			})

			// Markdown: bold/italic/strikethrough -> plain text (keep content)
			.replaceAll(/\*\*(.+?)\*\*/gs, '$1') // **bold**
			.replaceAll(/\*(.+?)\*/gs, '$1') // *italic*
			.replaceAll(/__(.+?)__/gs, '$1') // __bold__
			.replaceAll(/_(.+?)_/gs, '$1') // _italic_
			.replaceAll(/~~(.+?)~~/gs, '$1') // ~~strikethrough~~
			.replaceAll(/`{1,3}([^`]+)`{1,3}/g, '$1') // `code` / ```code```

			// Markdown: links -> label only
			.replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [label](url)

			// Markdown: headings -> plain line
			.replaceAll(/^#{1,6}\s+/gm, '') // # Heading

			// Markdown: blockquotes -> indented
			.replaceAll(/^>\s*/gm, '  ') // > quote

			// Typography: replace common Unicode punctuation with ASCII equivalents
			.replaceAll(/[\u2018\u2019]/g, "'") // curly single quotes -> '
			.replaceAll(/[\u201C\u201D]/g, '"') // curly double quotes -> "
			.replaceAll('\u2026', '… ') // ellipsis -> ...
			.replaceAll(/[\u2013\u2014]/g, '-') // en/em dash -> -
			.replaceAll('\u00B7', '.') // middle dot -> .
			.replaceAll('\u2022', '-') // bullet -> -
			.replaceAll(/[\u2010-\u2015\u2212]/g, '-') // various hyphens, minus sign -> -

			// Emojis: strip only complex/extended ones likely missing from embedded fonts
			.replaceAll(/[\u{1F300}-\u{1FFFF}]/gu, '') // non-BMP: misc symbols, emojis, pictographs
			.replaceAll(/[\u{1F000}-\u{1F2FF}]/gu, '') // mahjong, dominos, enclosed alphanumerics
			.replaceAll(/\uD83C[\uDDE0-\uDDFF]/g, '') // regional indicator pairs (flags)
			.replaceAll(/[\u{E0000}-\u{E01FF}]/gu, '') // tags block (used in flag sequences)
			.replaceAll(/[\u200D\u{1F3FB}-\u{1F3FF}\uFE0F]/gu, '') // ZWJ, skin tones, variation selector-16

			// Collapse 3+ newlines -> 2
			.replaceAll(/\n{3,}/g, '\n\n')

			.trim()
	);
}

export function capitalizeText(text: string): string {
	const parts = text.split(' ');
	return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function getStringChunks(text: string, maxLength: number): string[] {
	if (!text) {
		return [];
	}

	const words = text.split(' ');
	const lines: string[] = [];
	let currentLine = '';

	for (const word of words) {
		// Force-split any word that is itself longer than maxLength
		if (word.length > maxLength) {
			if (currentLine.trim()) {
				lines.push(currentLine.trim());
				currentLine = '';
			}
			let remaining = word;
			while (remaining.length > maxLength) {
				lines.push(remaining.substring(0, maxLength));
				remaining = remaining.substring(maxLength);
			}
			currentLine = remaining + ' ';
			continue;
		}

		if ((currentLine + word).length > maxLength) {
			lines.push(currentLine.trim());
			currentLine = word + ' ';
		} else {
			currentLine += word + ' ';
		}
	}

	if (currentLine.trim()) {
		lines.push(currentLine.trim());
	}

	return lines;
}

export function fmtScore(n: number): string {
	if (!n || n <= 0) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

export function fmtTimeAgo(createdUtc: number): string {
	if (!createdUtc) return 'unknown';
	const secs = Math.floor(Date.now() / 1000) - createdUtc;
	if (secs < 60) return 'now';
	if (secs < 3600) return `${Math.floor(secs / 60)}m`;
	if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
	if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
	if (secs < 2592000) return `${Math.floor(secs / 604800)}w`;
	if (secs < 31536000) return `${Math.floor(secs / 2592000)}mo`;
	return `${Math.floor(secs / 31536000)}y`;
}
