import { describe, expect, it } from 'vitest';
import { splitTextWithLinks } from '../src/shared/utils';

describe('splitTextWithLinks', () => {
	it('detects plain https links inside body text', () => {
		expect(splitTextWithLinks('See https://example.com now.')).toEqual([
			{ type: 'text', content: 'See ' },
			{ type: 'link', content: 'https://example.com', href: 'https://example.com' },
			{ type: 'text', content: ' now.' },
		]);
	});

	it('normalizes www links and keeps trailing punctuation out of the href', () => {
		expect(splitTextWithLinks('Visit www.example.com, please!')).toEqual([
			{ type: 'text', content: 'Visit ' },
			{ type: 'link', content: 'www.example.com', href: 'https://www.example.com' },
			{ type: 'text', content: ', please!' },
		]);
	});
});
