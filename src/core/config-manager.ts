/**
 * Configuration Manager
 *
 * Centralized config loading, saving, and access.
 * Single source of truth for the API base URL (config.api.baseUrl).
 */

import { DEFAULT_CONFIG, mergeConfig } from './config';
import type { AppConfig, AuthConfig, FeedConfig } from './types';

const AUTH_KEY = 'reddit-feed-auth';
const CONFIG_KEY = 'reddit-feed-config';

/**
 * Load the complete application configuration
 * Merges: Defaults < Saved Config < Auth (from separate key)
 */
export function loadConfig(): AppConfig {
	const configData = localStorage.getItem(CONFIG_KEY);
	const authData = localStorage.getItem(AUTH_KEY);
	const savedConfig: Partial<AppConfig> = configData ? JSON.parse(configData) : {};
	const savedAuth: Partial<AuthConfig> = authData ? JSON.parse(authData) : {};

	console.log('[ConfigManager] Default API base URL:', DEFAULT_CONFIG.api.baseUrl);

	// Start with defaults, merge saved config
	let config = mergeConfig(DEFAULT_CONFIG, savedConfig);

	// Also merge auth from separate auth key (for token, session, userAgent)
	if (savedAuth.tokenV2) config.auth.tokenV2 = savedAuth.tokenV2;
	if (savedAuth.session) config.auth.session = savedAuth.session;
	if (savedAuth.userAgent) config.auth.userAgent = savedAuth.userAgent;

	console.log('[ConfigManager] Merged API base URL:', config.api.baseUrl);
	console.log('[ConfigManager] Auth token present:', !!config.auth.tokenV2);
	console.log('[ConfigManager] Auth session present:', !!config.auth.session);

	return config;
}

/**
 * Save auth configuration
 */
export function saveAuth(auth: AuthConfig): void {
	localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

/**
 * Save the complete configuration
 */
export function saveConfig(config: Partial<AppConfig>): void {
	const existing = localStorage.getItem(CONFIG_KEY);
	const existingConfig = existing ? JSON.parse(existing) : {};
	const merged = { ...existingConfig, ...config };
	console.log('[ConfigManager] Saving config:', merged);
	localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
}

/**
 * Save the complete settings from SettingsView
 */
export function saveSettings(options: {
	auth: AuthConfig;
	feed: FeedConfig;
	cacheDurationMs: number;
	apiBaseUrl: string;
}): void {
	const { auth, feed, cacheDurationMs, apiBaseUrl } = options;

	// Save auth (no proxyUrl anymore)
	saveAuth(auth);

	// Save config with api.baseUrl
	saveConfig({
		feed,
		cache: { durationMs: cacheDurationMs },
		api: { baseUrl: apiBaseUrl },
	});
}

/**
 * Get the effective API base URL
 */
export function getApiBaseUrl(): string {
	const config = loadConfig();
	return config.api.baseUrl;
}

/**
 * Clear all configuration
 */
export function clearConfig(): void {
	localStorage.removeItem(AUTH_KEY);
	localStorage.removeItem(CONFIG_KEY);
}

/**
 * Load auth configuration (for SettingsView)
 */
export function loadAuth(): Partial<AuthConfig> {
	const authData = localStorage.getItem(AUTH_KEY);
	return authData ? JSON.parse(authData) : {};
}

/**
 * Load API configuration (for SettingsView)
 */
export function loadApiConfig(): { baseUrl?: string } {
	const configData = localStorage.getItem(CONFIG_KEY);
	const config = configData ? JSON.parse(configData) : {};
	return config.api || {};
}

/**
 * Load feed configuration (for SettingsView)
 */
export function loadFeedConfig(): Partial<FeedConfig> {
	const configData = localStorage.getItem(CONFIG_KEY);
	const config = configData ? JSON.parse(configData) : {};
	return config.feed || {};
}

/**
 * Load cache configuration (for SettingsView)
 */
export function loadCacheConfig(): { durationMs?: number } {
	const configData = localStorage.getItem(CONFIG_KEY);
	const config = configData ? JSON.parse(configData) : {};
	return config.cache || {};
}
