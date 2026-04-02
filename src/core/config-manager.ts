/**
 * Configuration Manager
 *
 * Centralized config loading, saving, and access.
 * Single source of truth for the API base URL (config.api.baseUrl).
 */

import { DEFAULT_CONFIG, mergeConfig } from './config';
import type { AppConfig, AuthConfig, FeedConfig } from './types';
import { getStoredItem, removeStoredItem, setStoredItem } from '../shared/storage';

const AUTH_KEY = 'reddit-feed-auth';
const CONFIG_KEY = 'reddit-feed-config';

/**
 * Load the complete application configuration
 * Merges: Defaults < Saved Config < Auth (from separate key)
 */
export async function loadConfig(): Promise<AppConfig> {
	const [configData, authData] = await Promise.all([getStoredItem(CONFIG_KEY), getStoredItem(AUTH_KEY)]);
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
export async function saveAuth(auth: AuthConfig): Promise<void> {
	await setStoredItem(AUTH_KEY, JSON.stringify(auth));
}

/**
 * Save the complete configuration
 */
export async function saveConfig(config: Partial<AppConfig>): Promise<void> {
	const existing = await getStoredItem(CONFIG_KEY);
	const existingConfig = existing ? JSON.parse(existing) : {};
	const merged = { ...existingConfig, ...config };
	console.log('[ConfigManager] Saving config:', merged);
	await setStoredItem(CONFIG_KEY, JSON.stringify(merged));
}

/**
 * Save the complete settings from SettingsView
 */
export async function saveSettings(options: {
	auth: AuthConfig;
	feed: FeedConfig;
	cacheDurationMs: number;
	apiBaseUrl: string;
}): Promise<void> {
	const { auth, feed, cacheDurationMs, apiBaseUrl } = options;

	// Save auth (no proxyUrl anymore)
	await saveAuth(auth);

	// Save config with api.baseUrl
	await saveConfig({
		feed,
		cache: { durationMs: cacheDurationMs },
		api: { baseUrl: apiBaseUrl },
	});
}

/**
 * Get the effective API base URL
 */
export async function getApiBaseUrl(): Promise<string> {
	const config = await loadConfig();
	return config.api.baseUrl;
}

/**
 * Clear all configuration
 */
export async function clearConfig(): Promise<void> {
	await Promise.all([removeStoredItem(AUTH_KEY), removeStoredItem(CONFIG_KEY)]);
}

/**
 * Load auth configuration (for SettingsView)
 */
export async function loadAuth(): Promise<Partial<AuthConfig>> {
	const authData = await getStoredItem(AUTH_KEY);
	return authData ? JSON.parse(authData) : {};
}

/**
 * Load API configuration (for SettingsView)
 */
export async function loadApiConfig(): Promise<{ baseUrl?: string }> {
	const configData = await getStoredItem(CONFIG_KEY);
	const config = configData ? JSON.parse(configData) : {};
	return config.api || {};
}

/**
 * Load feed configuration (for SettingsView)
 */
export async function loadFeedConfig(): Promise<Partial<FeedConfig>> {
	const configData = await getStoredItem(CONFIG_KEY);
	const config = configData ? JSON.parse(configData) : {};
	return config.feed || {};
}

/**
 * Load cache configuration (for SettingsView)
 */
export async function loadCacheConfig(): Promise<{ durationMs?: number }> {
	const configData = await getStoredItem(CONFIG_KEY);
	const config = configData ? JSON.parse(configData) : {};
	return config.cache || {};
}
