/**
 * Reddit API Rate Limiter
 * 
 * Automatically tracks rate limits from Reddit API headers and throttles
 * requests when approaching limits.
 * 
 * Reddit rate limits:
 * - OAuth: 60 requests/minute
 * - Cookie-based: ~30-40 requests/minute (estimated)
 * - Unauthenticated: ~10-20 requests/minute (estimated)
 */

import { RateLimitState } from '../core/types';

export class RateLimiter {
  private state: RateLimitState = {
    used: 0,
    remaining: 60,
    resetSeconds: 60,
    lastUpdated: Date.now(),
  };

  private minRemaining: number;
  private safetyBufferMs: number;

  constructor(options: { minRemaining?: number; safetyBufferMs?: number } = {}) {
    this.minRemaining = options.minRemaining ?? 5;
    this.safetyBufferMs = options.safetyBufferMs ?? 1000;
  }

  /**
   * Update rate limit state from API response headers
   */
  updateFromHeaders(headers: Headers): void {
    const used = headers.get('x-ratelimit-used');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');

    if (used !== null) {
      this.state.used = parseInt(used, 10);
    }
    if (remaining !== null) {
      this.state.remaining = parseInt(remaining, 10);
    }
    if (reset !== null) {
      this.state.resetSeconds = parseInt(reset, 10);
    }

    this.state.lastUpdated = Date.now();

    console.log(`[RateLimiter] Status: ${this.state.used} used, ${this.state.remaining} remaining, reset in ${this.state.resetSeconds}s`);
  }

  /**
   * Check if we should throttle before making a request
   */
  async throttle(): Promise<void> {
    if (this.state.remaining > this.minRemaining) {
      return;
    }

    // Calculate wait time with safety buffer
    const waitMs = (this.state.resetSeconds * 1000) + this.safetyBufferMs;

    console.log(`[RateLimiter] Throttling for ${waitMs}ms (${this.state.remaining} remaining)`);

    await new Promise(resolve => setTimeout(resolve, waitMs));

    // Reset state estimate after throttle
    this.state.remaining = 60;
    this.state.used = 0;
  }

  /**
   * Get current rate limit state
   */
  getState(): RateLimitState {
    return { ...this.state };
  }

  /**
   * Estimate if we can make a request without hitting the limit
   */
  canMakeRequest(): boolean {
    return this.state.remaining > this.minRemaining;
  }

  /**
   * Get estimated time until rate limit resets
   */
  getTimeUntilReset(): number {
    return this.state.resetSeconds * 1000;
  }
}
