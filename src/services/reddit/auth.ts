/**
 * Reddit Authentication Manager
 * 
 * Handles cookie-based authentication with Reddit.
 * Based on reddit-pi implementation.
 * 
 * Auth flow:
 * 1. Provide token_v2 (and optionally reddit_session) cookies
 * 2. Fetch modhash from /api/me.json
 * 3. Include modhash in POST request headers
 */

import { AuthConfig } from '../../types';

export class AuthManager {
  private config: AuthConfig;
  private modhash: string = '';
  private isInitialized: boolean = false;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /**
   * Build request headers with authentication
   */
  buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.config.userAgent,
      'Accept': 'application/json',
      ...extra,
    };

    // Add cookie-based auth
    if (this.config.type === 'cookie') {
      const cookies: string[] = [];

      if (this.config.tokenV2) {
        cookies.push(`token_v2=${this.config.tokenV2}`);
      }

      if (this.config.session) {
        cookies.push(`reddit_session=${this.config.session}`);
      }

      if (cookies.length > 0) {
        headers['Cookie'] = cookies.join('; ');
      }
    }

    // Add modhash for POST requests
    if (this.modhash) {
      headers['x-modhash'] = this.modhash;
    }

    return headers;
  }

  /**
   * Initialize authentication by fetching modhash
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.config.type === 'cookie') {
      if (!this.config.tokenV2) {
        throw new Error('Missing REDDIT_TOKEN_V2. Please configure authentication.');
      }

      await this.fetchModhash();
    }

    this.isInitialized = true;
  }

  /**
   * Fetch modhash from Reddit API
   */
  private async fetchModhash(): Promise<void> {
    try {
      const response = await fetch('https://www.reddit.com/api/me.json', {
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed (${response.status}). Please check your Reddit token.`);
        }
        throw new Error(`Failed to fetch modhash: ${response.status}`);
      }

      const data = await response.json();
      this.modhash = data.data?.modhash || '';

      if (!this.modhash) {
        console.warn('[AuthManager] No modhash in response, some actions may fail');
      } else {
        console.log('[AuthManager] Modhash acquired successfully');
      }
    } catch (error) {
      console.error('[AuthManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Refresh modhash (call if POST requests start failing)
   */
  async refresh(): Promise<void> {
    this.isInitialized = false;
    await this.initialize();
  }

  /**
   * Get current modhash
   */
  getModhash(): string {
    return this.modhash;
  }

  /**
   * Check if authenticated and initialized
   */
  isAuthenticated(): boolean {
    if (this.config.type === 'cookie') {
      return !!this.config.tokenV2 && this.isInitialized;
    }
    return this.isInitialized;
  }

  /**
   * Update auth configuration
   */
  updateConfig(config: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...config };
    this.isInitialized = false;
    this.modhash = '';
  }

  /**
   * Get auth configuration
   */
  getConfig(): AuthConfig {
    return { ...this.config };
  }
}
