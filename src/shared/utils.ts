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
			.replaceAll('\u2026', '...') // ellipsis -> ...
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
