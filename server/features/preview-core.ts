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

	for (const provider of providers) {
		const preview = await provider(url, signal);
		if (preview) return preview;
		throwIfAborted(signal);
	}

	return null;
}
