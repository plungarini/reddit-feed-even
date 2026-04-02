import { describe, expect, it, vi } from 'vitest';
import { loadLinkPreview } from '../src/api/link-preview';

describe('loadLinkPreview', () => {
	it('returns normalized preview data and persists it on success', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				url: 'https://example.com/story',
				title: 'Hello &amp; Welcome',
				description: 'A **bold** summary',
				image: 'https://example.com/image.jpg?x=1&amp;y=2',
			}),
		});
		const setCached = vi.fn().mockResolvedValue(undefined);

		const result = await loadLinkPreview('https://example.com/story', 'https://proxy.example.com', {
			fetchImpl: fetchImpl as unknown as typeof fetch,
			getCached: async () => null,
			setCached,
		});

		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(result).toEqual({
			url: 'https://example.com/story',
			domain: 'example.com',
			title: 'Hello & Welcome',
			description: 'A bold summary',
			image: 'https://example.com/image.jpg?x=1&y=2',
		});
		expect(setCached).toHaveBeenCalledWith('https://example.com/story', {
			title: 'Hello & Welcome',
			description: 'A bold summary',
			image: 'https://example.com/image.jpg?x=1&y=2',
		});
	});

	it('falls back to domain-only data when the preview request fails', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

		const result = await loadLinkPreview('https://sub.example.com/path', 'https://proxy.example.com', {
			fetchImpl: fetchImpl as unknown as typeof fetch,
			getCached: async () => null,
			setCached: async () => undefined,
		});

		expect(result).toEqual({
			url: 'https://sub.example.com/path',
			domain: 'sub.example.com',
			title: undefined,
			description: undefined,
			image: undefined,
		});
		warnSpy.mockRestore();
	});
});
