import { describe, expect, it } from 'vitest';
import { fetchPreviewWithFallback, type PreviewFetcher } from '../server/features/preview-core';

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);

		const onAbort = () => {
			cleanup();
			reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
		};

		const cleanup = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		};

		if (signal?.aborted) {
			onAbort();
			return;
		}

		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

describe('fetchPreviewWithFallback', () => {
	it('returns the first successful preview even if an earlier provider is slower', async () => {
		const slowMiss: PreviewFetcher = async (_url, signal) => {
			await wait(40, signal);
			return null;
		};
		const fastHit: PreviewFetcher = async (url, signal) => {
			await wait(10, signal);
			return {
				method: 'microlink',
				url,
				title: 'Fast hit',
				description: 'Found quickly',
			};
		};

		const result = await fetchPreviewWithFallback('https://example.com/story', undefined, [slowMiss, fastHit]);

		expect(result).toEqual({
			method: 'microlink',
			url: 'https://example.com/story',
			title: 'Fast hit',
			description: 'Found quickly',
		});
	});

	it('rejects when the caller aborts the request', async () => {
		const controller = new AbortController();
		const slowProvider: PreviewFetcher = async (_url, signal) => {
			await wait(50, signal);
			return {
				method: 'scrape',
				url: 'https://example.com/story',
				title: 'Too slow',
				description: 'Should never resolve',
			};
		};

		const result = fetchPreviewWithFallback('https://example.com/story', controller.signal, [slowProvider]);
		setTimeout(() => controller.abort(new DOMException('Cancelled by caller.', 'AbortError')), 10);

		await expect(result).rejects.toMatchObject({ name: 'AbortError' });
	});
});
