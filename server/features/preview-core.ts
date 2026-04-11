import { PreviewData } from '../types/preview';

export type PreviewFetcher = (url: string, signal?: AbortSignal) => Promise<PreviewData | null>;

export function mergeAbortSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
	const activeSignals = signals.filter(Boolean) as AbortSignal[];
	if (activeSignals.length === 0) return undefined;
	if (activeSignals.length === 1) return activeSignals[0];

	const controller = new AbortController();
	const abortFrom = (signal: AbortSignal) => {
		cleanup();
		controller.abort(signal.reason);
	};
	const onAbort = (event: Event) => abortFrom(event.target as AbortSignal);
	const cleanup = () => {
		activeSignals.forEach((signal) => signal.removeEventListener('abort', onAbort));
	};

	for (const signal of activeSignals) {
		if (signal.aborted) {
			abortFrom(signal);
			return controller.signal;
		}
		signal.addEventListener('abort', onAbort, { once: true });
	}

	controller.signal.addEventListener('abort', cleanup, { once: true });
	return controller.signal;
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true;
	if (error instanceof DOMException) return error.name === 'AbortError';
	return error instanceof Error && error.name === 'AbortError';
}

export function throwIfAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

export async function fetchPreviewWithFallback(
	url: string,
	signal: AbortSignal | undefined,
	providers: PreviewFetcher[],
): Promise<PreviewData | null> {
	throwIfAborted(signal);
	if (providers.length === 0) return null;

	const winnerAbortController = new AbortController();
	const providerSignal = mergeAbortSignals([signal, winnerAbortController.signal]);

	return await new Promise<PreviewData | null>((resolve, reject) => {
		let pending = providers.length;
		let settled = false;

		const resolveIfDone = (preview: PreviewData | null) => {
			if (settled) return;
			settled = true;
			if (preview) winnerAbortController.abort(new DOMException('Preview resolved elsewhere.', 'AbortError'));
			resolve(preview);
		};

		const rejectOnce = (error: unknown) => {
			if (settled) return;
			settled = true;
			if (!winnerAbortController.signal.aborted) {
				winnerAbortController.abort(error);
			}
			reject(error);
		};

		const markMiss = () => {
			if (settled) return;
			pending -= 1;
			if (pending === 0) resolveIfDone(null);
		};

		for (const provider of providers) {
			void (async () => {
				try {
					const preview = await provider(url, providerSignal);
					if (preview) {
						resolveIfDone(preview);
						return;
					}
					markMiss();
				} catch (error) {
					if (isAbortError(error, signal)) {
						rejectOnce(error);
						return;
					}
					if (winnerAbortController.signal.aborted && !signal?.aborted && isAbortError(error, providerSignal)) {
						return;
					}
					rejectOnce(error);
				}
			})();
		}
	});
}
