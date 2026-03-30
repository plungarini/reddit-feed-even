/**
 * Link Preview Cache
 *
 * Client-side caching for link preview results with configurable TTL.
 * Uses localStorage for persistence across sessions.
 *
 * Cache constraints:
 * - Default: 5 minutes
 * - Minimum: 1 minute
 * - Maximum: 24 hours
 */

import { clamp } from '../shared/utils';

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
 * Get the configured cache TTL from localStorage
 */
export function getPreviewCacheTtl(): number {
	try {
		const stored = localStorage.getItem(STORAGE_KEY_TTL);
		if (stored) {
			const parsed = parseInt(stored, 10);
			if (!isNaN(parsed)) {
				return clampPreviewCacheTtl(parsed);
			}
		}
	} catch {
		// localStorage not available
	}
	return PREVIEW_CACHE_CONFIG.DEFAULT_TTL_MS;
}

/**
 * Set the cache TTL (clamped to valid range)
 */
export function setPreviewCacheTtl(ttlMs: number): void {
	try {
		const clamped = clampPreviewCacheTtl(ttlMs);
		localStorage.setItem(STORAGE_KEY_TTL, String(clamped));
	} catch {
		// localStorage not available
	}
}

/**
 * Load cache from localStorage
 */
function loadCache(): CacheStorage {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored) as CacheStorage;
		}
	} catch {
		// localStorage not available or corrupt
	}
	return {};
}

/**
 * Save cache to localStorage
 */
function saveCache(cache: CacheStorage): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// localStorage not available or quota exceeded
		// Clear old entries if quota exceeded
		if (isQuotaExceededError()) {
			clearExpiredEntries();
		}
	}
}

/**
 * Check if error is quota exceeded
 */
function isQuotaExceededError(): boolean {
	try {
		localStorage.setItem('__test__', 'test');
		localStorage.removeItem('__test__');
		return false;
	} catch (e) {
		return true;
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
export function getCachedPreview(url: string): CachedPreview | null {
	const cache = loadCache();
	const key = normalizeUrl(url);
	const entry = cache[key];

	if (!entry) return null;

	// Check if expired
	if (Date.now() > entry.expiresAt) {
		// Remove expired entry
		delete cache[key];
		saveCache(cache);
		return null;
	}

	return entry.data;
}

/**
 * Store preview in cache
 */
export function setCachedPreview(url: string, data: Omit<CachedPreview, 'url' | 'cachedAt'>): void {
	const cache = loadCache();
	const key = normalizeUrl(url);
	const ttl = getPreviewCacheTtl();

	cache[key] = {
		data: {
			url,
			...data,
			cachedAt: Date.now(),
		},
		expiresAt: Date.now() + ttl,
	};

	saveCache(cache);
}

/**
 * Check if preview is cached and valid
 */
export function hasCachedPreview(url: string): boolean {
	return getCachedPreview(url) !== null;
}

/**
 * Clear all cached previews
 */
export function clearPreviewCache(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// localStorage not available
	}
}

/**
 * Clear expired entries from cache
 */
export function clearExpiredEntries(): void {
	const cache = loadCache();
	const now = Date.now();
	let modified = false;

	for (const key of Object.keys(cache)) {
		if (now > cache[key].expiresAt) {
			delete cache[key];
			modified = true;
		}
	}

	if (modified) {
		saveCache(cache);
	}
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { total: number; expired: number } {
	const cache = loadCache();
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
