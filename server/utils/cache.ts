/**
 * Cache Utilities for Wrangler Cache API
 *
 * Provides caching for link preview results with configurable TTL.
 * - Default: 5 minutes
 * - Minimum: 1 minute
 * - Maximum: 24 hours
 */

export const CACHE_CONFIG = {
	/** Default cache duration: 5 minutes in seconds */
	DEFAULT_TTL_SECONDS: 5 * 60,
	/** Minimum cache duration: 1 minute in seconds */
	MIN_TTL_SECONDS: 1 * 60,
	/** Maximum cache duration: 24 hours in seconds */
	MAX_TTL_SECONDS: 24 * 60 * 60,
} as const;

export interface CacheOptions {
	/** TTL in seconds (will be clamped between MIN and MAX) */
	ttlSeconds?: number;
}

/**
 * Clamp TTL to valid range (1 min to 24 hours)
 */
export function clampTtl(ttlSeconds: number): number {
	return Math.max(
		CACHE_CONFIG.MIN_TTL_SECONDS,
		Math.min(CACHE_CONFIG.MAX_TTL_SECONDS, ttlSeconds)
	);
}

/**
 * Generate a cache key for a URL
 */
export function generateCacheKey(url: string, prefix = 'preview'): Request {
	const normalizedUrl = url.trim().toLowerCase();
	return new Request(`https://cache/${prefix}/${encodeURIComponent(normalizedUrl)}`);
}

/**
 * Check if a cached response is still valid (not expired)
 */
export function isCacheValid(cached: Response, maxAgeSeconds: number): boolean {
	const dateHeader = cached.headers.get('date');
	if (!dateHeader) return false;

	const cachedTime = new Date(dateHeader).getTime();
	const now = Date.now();
	const ageMs = now - cachedTime;
	const ageSeconds = ageMs / 1000;

	return ageSeconds < maxAgeSeconds;
}

/**
 * Get cache duration from request header or use default
 * Clients can send X-Cache-TTL header to request a specific cache duration
 */
export function getCacheTtlFromRequest(request: Request): number {
	const headerTtl = request.headers.get('X-Cache-TTL');
	if (headerTtl) {
		const parsed = parseInt(headerTtl, 10);
		if (!isNaN(parsed)) {
			return clampTtl(parsed);
		}
	}
	return CACHE_CONFIG.DEFAULT_TTL_SECONDS;
}
