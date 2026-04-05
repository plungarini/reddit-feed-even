import { CachedPreview, getCachedPreview, setCachedPreview } from './preview-cache';
import { normalizeWebText } from '../shared/utils';

export interface LinkPreviewData {
	url: string;
	domain: string;
	title?: string;
	description?: string;
	image?: string;
}

interface PreviewApiResponse {
	url: string;
	title?: string;
	description?: string;
	image?: string;
}

interface LoadLinkPreviewDeps {
	fetchImpl?: typeof fetch;
	getCached?: (url: string) => Promise<CachedPreview | null>;
	setCached?: (url: string, data: Omit<CachedPreview, 'url' | 'cachedAt'>) => Promise<void>;
	signal?: AbortSignal;
}

function mergeAbortSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
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

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true;
	if (error instanceof DOMException) return error.name === 'AbortError';
	return error instanceof Error && error.name === 'AbortError';
}

export function extractDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url.substring(0, 30);
	}
}

export function resolvePreviewApiBase(baseUrl: string | null | undefined): string | null {
	if (!baseUrl) return null;
	const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
	return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export function normalizeLinkPreview(
	url: string,
	data?: Partial<PreviewApiResponse | CachedPreview> | null,
): LinkPreviewData {
	return {
		url,
		domain: extractDomain(url),
		title: data?.title ? normalizeWebText(data.title) : undefined,
		description: data?.description ? normalizeWebText(data.description) : undefined,
		image: data?.image ? data.image.replaceAll('&amp;', '&') : undefined,
	};
}

export async function loadLinkPreview(
	url: string,
	baseUrl: string | null | undefined,
	deps: LoadLinkPreviewDeps = {},
): Promise<LinkPreviewData> {
	if (!url) return normalizeLinkPreview(url);
	if (deps.signal?.aborted) return normalizeLinkPreview(url);

	const cached = await (deps.getCached ?? getCachedPreview)(url);
	if (cached) {
		return normalizeLinkPreview(url, cached);
	}
	if (deps.signal?.aborted) return normalizeLinkPreview(url);

	const previewApiBase = resolvePreviewApiBase(baseUrl);
	if (!previewApiBase) {
		return normalizeLinkPreview(url);
	}

	try {
		const requestSignal = mergeAbortSignals([deps.signal, AbortSignal.timeout(60_000)]);
		const response = await (deps.fetchImpl ?? fetch)(`${previewApiBase}/preview?url=${encodeURIComponent(url)}`, {
			signal: requestSignal,
		});

		if (!response.ok) {
			throw new Error(`Preview API error: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as PreviewApiResponse;
		const normalized = normalizeLinkPreview(url, data);
		if (deps.signal?.aborted) return normalizeLinkPreview(url);

		if (normalized.title || normalized.description || normalized.image) {
			await (deps.setCached ?? setCachedPreview)(url, {
				title: normalized.title,
				description: normalized.description,
				image: normalized.image,
			});
		}

		return normalized;
	} catch (error) {
		if (isAbortError(error, deps.signal)) {
			return normalizeLinkPreview(url);
		}
		console.warn('[LinkPreview] Failed to load preview:', error);
		return normalizeLinkPreview(url);
	}
}
