import { env } from 'cloudflare:workers';
import { PreviewData } from '../types/preview';
import { OEMBED_PROVIDERS } from '../utils/oembed';

const ENV = env as Record<string, string>;
const LINKPREVIEW_API_KEY = ENV.LINKPREVIEW_API_KEY;
const PEEKALINK_API_KEY = ENV.PEEKALINK_API_KEY;

class PeekalinkRedirectLoopError extends Error {
	constructor(url: string) {
		super(`Peekalink: link redirects to itself (${url})`);
		this.name = 'PeekalinkRedirectLoopError';
	}
}

function getOembedUrl(url: string): string | null {
	try {
		const host = new URL(url).hostname.replace('www.', '');
		const provider = Object.keys(OEMBED_PROVIDERS).find((k) => host.endsWith(k));
		return provider ? OEMBED_PROVIDERS[provider](url) : null;
	} catch {
		return null;
	}
}

async function fetchViaOembed(url: string): Promise<PreviewData | null> {
	const oembedUrl = getOembedUrl(url);
	if (!oembedUrl) return null;

	try {
		const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5_000) });
		if (!res.ok) throw new Error(`Error: ${res.status} | ${res.statusText}`);
		const data = await res.json<{ title?: string; thumbnail_url?: string; author_name?: string }>();

		console.log('[PREVIEW] Fetch via oembed', { title: data?.title });

		return {
			method: 'oembed',
			url,
			title: data.title,
		};
	} catch (err) {
		console.warn('[PREVIEW] Fetch via oembed failed', err);
		return null;
	}
}

async function fetchViaMicrolink(url: string): Promise<PreviewData | null> {
	try {
		const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new Error(`Error: ${res.status} | ${res.statusText}`);
		const { data } = await res.json<{ data: { title?: string; description?: string; image?: { url?: string } } }>();

		console.log('[PREVIEW] Fetch via microlink', { title: data?.title, description: data?.description });

		const response: PreviewData = {
			method: 'microlink',
			url,
			title: data?.title,
			description: data?.description,
		};

		if (!response.title || !response.description) throw new Error('Error: No title or description');
		return response;
	} catch (err) {
		console.warn('[PREVIEW] Fetch via microlink failed', err);
		return null;
	}
}

async function fetchViaPeekalink(url: string): Promise<PreviewData | null> {
	try {
		const res = await fetch('https://api.peekalink.io/', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${PEEKALINK_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ link: url }),
			signal: AbortSignal.timeout(15_000),
		});
		const data = await res.json<{
			title?: string;
			description?: string;
			image?: { thumbnail: { url?: string } };
			error?: string;
		}>();

		if (!res.ok) {
			if (data?.error === 'LINK_REDIRECTS_TO_ITSELF') throw new PeekalinkRedirectLoopError(url);
			throw new Error(`Error: ${res.status} | ${res.statusText}`);
		}

		console.log('[PREVIEW] Fetch via peekalink', { title: data?.title, description: data?.description });

		const response: PreviewData = {
			method: 'peekalink',
			url,
			title: data?.title,
			description: data?.description,
		};

		if (!response.title || !response.description) throw new Error('Error: No title or description');
		return response;
	} catch (err) {
		console.warn('[PREVIEW] Fetch via peekalink failed', err);
		return null;
	}
}

async function fetchViaLinkpreviewnet(url: string): Promise<PreviewData | null> {
	try {
		const res = await fetch(`https://api.linkpreview.net/?q=${encodeURIComponent(url)}&fields=title,description`, {
			headers: {
				'X-Linkpreview-Api-Key': LINKPREVIEW_API_KEY,
			},
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new Error(`Error: ${res.status} | ${res.statusText}`);
		const data = await res.json<{ title?: string; description?: string }>();

		console.log('[PREVIEW] Fetch via linkpreviewnet', { title: data?.title, description: data?.description });

		const response: PreviewData = {
			method: 'linkpreviewnet',
			url,
			title: data?.title,
			description: data?.description,
		};

		if (!response.title || !response.description) throw new Error('Error: No title or description');
		return response;
	} catch (err) {
		console.warn('[PREVIEW] Fetch via linkpreviewnet failed', err);
		return null;
	}
}

async function fetchViaScrape(url: string): Promise<PreviewData | null> {
	try {
		const res = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; RedditClientEven/1.0; +https://plungarini.github.io)',
				Accept: 'text/html',
				Range: 'bytes=0-51200',
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok && res.status !== 206) return null;

		let ogTitle = '',
			htmlTitle = '',
			desc = '';

		const rewriter = new HTMLRewriter()
			.on('meta', {
				element(e) {
					const name = (e.getAttribute('name') || e.getAttribute('property'))?.toLowerCase();
					const content = e.getAttribute('content');
					if (!name || !content) return;
					if (
						[
							'og:title',
							'twitter:title',
							'sailthru.title', // used by some news sites
							'parsely-title', // used by publishers using Parse.ly analytics
							'dc.title', // Dublin Core
							'dcterms.title', // Dublin Core terms
						].includes(name)
					)
						ogTitle = ogTitle || content;
					if (
						[
							'og:description',
							'twitter:description',
							'description',
							'sailthru.description',
							'parsely-description',
							'dc.description',
							'dcterms.description',
						].includes(name)
					)
						desc = desc || content;
				},
			})
			.on('title', {
				text(t) {
					htmlTitle += t.text;
				},
			});

		const transformed = rewriter.transform(res);
		if (transformed.body) {
			const reader = transformed.body.getReader();
			let bytesRead = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				bytesRead += value?.byteLength ?? 0;
				if (bytesRead > 51200) {
					await reader.cancel();
					break;
				}
			}
		}

		const title = (ogTitle || htmlTitle || '').replaceAll(/\s+/g, ' ').trim() || undefined;

		const response: PreviewData = {
			method: 'scrape',
			url,
			title,
			description: desc.replaceAll(/\s+/g, ' ').trim(),
		};

		if (!response.title || !response.description) return null;
		return response;
	} catch {
		return null;
	}
}

export const preview = {
	fetchViaOembed,
	fetchViaMicrolink,
	fetchViaPeekalink,
	fetchViaLinkpreviewnet,
	fetchViaScrape,
};
