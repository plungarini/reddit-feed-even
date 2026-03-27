/**
 * Reddit Authentication Manager
 *
 * Handles cookie-based authentication with Reddit.
 * The actual cookie setting happens in the proxy server (server/index.ts).
 * This class just manages the token/config and builds headers for the proxy.
 */

import { AuthConfig } from '../core/types';

export class AuthManager {
	private config: AuthConfig;
	private isInitialized: boolean = false;

	constructor(config: AuthConfig) {
		this.config = config;
	}

	/**
	 * Build request headers for the proxy.
	 * The proxy will convert X-Reddit-Token and X-Reddit-Session to Cookie header.
	 */
	buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
		const headers: Record<string, string> = {
			'User-Agent': this.config.userAgent,
			Accept: 'application/json',
			...extra,
		};

		// Send tokens to proxy via custom headers (proxy converts to Cookie)
		if (this.config.tokenV2) {
			headers['X-Reddit-Token'] = this.config.tokenV2;
		}
		if (this.config.session) {
			headers['X-Reddit-Session'] = this.config.session;
		}

		return headers;
	}

	/**
	 * Initialize authentication.
	 * For feed reading, we just need to have the tokens.
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		console.log('[AuthManager] Initializing, tokenV2 present:', !!this.config.tokenV2);
		console.log('[AuthManager] Session present:', !!this.config.session);

		this.isInitialized = true;
	}

	/**
	 * Check if authenticated (has token)
	 */
	isAuthenticated(): boolean {
		return !!(this.config.tokenV2 && this.config.session);
	}

	/**
	 * Update auth configuration
	 */
	updateConfig(config: Partial<AuthConfig>): void {
		this.config = { ...this.config, ...config };
		this.isInitialized = false;
	}

	/**
	 * Get auth configuration
	 */
	getConfig(): AuthConfig {
		return { ...this.config };
	}
}
