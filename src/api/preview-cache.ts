/**
 * Link Preview Cache
 *
 * Client-side caching for link preview results with configurable TTL.
 * Uses shared storage for persistence across sessions.
 *
 * Cache constraints:
 * - Default: 5 minutes
 * - Minimum: 1 minute
 * - Maximum: 24 hours
 */

import { clamp } from '../shared/utils';
import { getStoredItem, removeStoredItem, setStoredItem } from '../shared/storage';

export const PREVIEW_CACHE_CONFIG = {
	/** Default cache duration: 5 minutes in milliseconds */
	DEFAULT_TTL_MS: 5 * 60 * 1000,
	/** Minimum cache duration: 1 minute in milliseconds */
	MIN_TTL_MS: 1 * 60 * 1000,
	/** Maximum cache duration: 24 hours in milliseconds */
	MAX_TTL_MS: 24 * 60 * 60 * 1000,
} as const;

const STORAGE_KEY = 'reddit-feed-preview-cache';
const STORAGE_KEY_TTL = 'reddit-feed-preview-cache-ttl';

export interface CachedPreview {
	url: string;
	title?: string;
	description?: string;
	cachedAt: number;
}

interface CacheEntry {
	data: CachedPreview;
	expiresAt: number;
}

interface CacheStorage {
	[url: string]: CacheEntry;
}

/**
 * Clamp TTL to valid range (1 min to 24 hours)
 */
export function clampPreviewCacheTtl(ttlMs: number): number {
	return clamp(ttlMs, PREVIEW_CACHE_CONFIG.MIN_TTL_MS, PREVIEW_CACHE_CONFIG.MAX_TTL_MS);
}

/**
 * Get the configured cache TTL from shared storage
 */
export async function getPreviewCacheTtl(): Promise<number> {
	try {
		const stored = await getStoredItem(STORAGE_KEY_TTL);
		if (stored) {
			const parsed = parseInt(stored, 10);
			if (!isNaN(parsed)) {
				return clampPreviewCacheTtl(parsed);
			}
		}
	} catch {
		// storage not available
	}
	return PREVIEW_CACHE_CONFIG.DEFAULT_TTL_MS;
}

/**
 * Set the cache TTL (clamped to valid range)
 */
export async function setPreviewCacheTtl(ttlMs: number): Promise<void> {
	try {
		const clamped = clampPreviewCacheTtl(ttlMs);
		await setStoredItem(STORAGE_KEY_TTL, String(clamped));
	} catch {
		// storage not available
	}
}

/**
 * Load cache from shared storage
 */
async function loadCache(): Promise<CacheStorage> {
	try {
		const stored = await getStoredItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored) as CacheStorage;
		}
	} catch {
		// storage not available or corrupt
	}
	return {};
}

/**
 * Save cache to shared storage
 */
async function saveCache(cache: CacheStorage): Promise<void> {
	try {
		await setStoredItem(STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// storage not available or quota exceeded
		// Clear old entries if quota exceeded
		await clearExpiredEntries();
	}
}

/**
 * Generate normalized cache key for URL
 */
function normalizeUrl(url: string): string {
	return url.trim().toLowerCase();
}

/**
 * Get cached preview for URL if not expired
 */
export async function getCachedPreview(url: string): Promise<CachedPreview | null> {
	const cache = await loadCache();
	const key = normalizeUrl(url);
	const entry = cache[key];

	if (!entry) return null;

	// Check if expired
	if (Date.now() > entry.expiresAt) {
		// Remove expired entry
		delete cache[key];
		await saveCache(cache);
		return null;
	}

	return entry.data;
}

/**
 * Store preview in cache
 */
export async function setCachedPreview(url: string, data: Omit<CachedPreview, 'url' | 'cachedAt'>): Promise<void> {
	const cache = await loadCache();
	const key = normalizeUrl(url);
	const ttl = await getPreviewCacheTtl();

	cache[key] = {
		data: {
			url,
			...data,
			cachedAt: Date.now(),
		},
		expiresAt: Date.now() + ttl,
	};

	await saveCache(cache);
}

/**
 * Check if preview is cached and valid
 */
export async function hasCachedPreview(url: string): Promise<boolean> {
	return (await getCachedPreview(url)) !== null;
}

/**
 * Clear all cached previews
 */
export async function clearPreviewCache(): Promise<void> {
	try {
		await removeStoredItem(STORAGE_KEY);
	} catch {
		// storage not available
	}
}

/**
 * Clear expired entries from cache
 */
export async function clearExpiredEntries(): Promise<void> {
	const cache = await loadCache();
	const now = Date.now();
	let modified = false;

	for (const key of Object.keys(cache)) {
		if (now > cache[key].expiresAt) {
			delete cache[key];
			modified = true;
		}
	}

	if (modified) {
		await saveCache(cache);
	}
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ total: number; expired: number }> {
	const cache = await loadCache();
	const now = Date.now();
	let expired = 0;

	for (const key of Object.keys(cache)) {
		if (now > cache[key].expiresAt) {
			expired++;
		}
	}

	return {
		total: Object.keys(cache).length,
		expired,
	};
}
