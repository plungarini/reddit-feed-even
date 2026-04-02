import { Button, Card, Input, SectionHeader, Select, SettingsGroup, Toast, Toggle } from 'even-toolkit/web';
import React, { useEffect, useState } from 'react';
import { clearExpiredEntries, clearPreviewCache, PREVIEW_CACHE_CONFIG, setPreviewCacheTtl } from '../../api/preview-cache';
import { ENDPOINTS } from '../../core/config';
import { clearConfig, loadApiConfig, loadAuth, loadCacheConfig, loadFeedConfig, saveSettings } from '../../core/config-manager';
import { clamp } from '../../shared/utils';

const ENV_PROXY_URL = (globalThis as any)?.__REDDIT_CLIENT_ENV__?.REDDIT_PROXY_URL;

/** Mobile-friendly stacked field: label + optional hint above the input. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="bg-surface py-4 flex flex-row flex-wrap justify-between gap-2">
			<div className="flex flex-col gap-2">
				<span className="text-normal-title text-text">{label}</span>
				{hint && <span className="text-detail text-text-dim">{hint}</span>}
			</div>
			{children}
		</div>
	);
}

function clearAll() {
	if (confirm('Reset all settings and auth data?')) {
		void (async () => {
			await clearConfig();
			await clearPreviewCache();
			globalThis.location.reload();
		})();
	}
}

export function SettingsView() {
	const [token, setToken] = useState('');
	const [session, setSession] = useState('');
	const [proxyUrl, setProxyUrl] = useState(ENV_PROXY_URL || '');
	const [feed, setFeed] = useState('hot');
	const [cacheMins, setCacheMins] = useState('5');

	// Cache constraints
	const MIN_CACHE_MINUTES = Math.max(1, Math.floor(PREVIEW_CACHE_CONFIG.MIN_TTL_MS / 60000));
	const MAX_CACHE_MINUTES = Math.floor(PREVIEW_CACHE_CONFIG.MAX_TTL_MS / 60000);

	const [showMediaOnly, setShowMediaOnly] = useState(false);
	const [toast, setToast] = useState('');
	const [userAgent, setUserAgent] = useState('reddit-feed-even/1.0');

	useEffect(() => {
		void (async () => {
			try {
				// Use config manager to load settings
				const [auth, apiConfig, feedConfig, cacheConfig] = await Promise.all([
					loadAuth(),
					loadApiConfig(),
					loadFeedConfig(),
					loadCacheConfig(),
				]);

				if (auth.tokenV2) setToken(auth.tokenV2);
				if (auth.session) setSession(auth.session);
				if (auth.userAgent) setUserAgent(auth.userAgent);

				// Load proxy URL from api.baseUrl (or fallback to env)
				if (apiConfig.baseUrl) setProxyUrl(apiConfig.baseUrl);
				else if (ENV_PROXY_URL) setProxyUrl(ENV_PROXY_URL);

				if (feedConfig.endpoint) setFeed(feedConfig.endpoint);
				if (feedConfig.showMediaOnly !== undefined) setShowMediaOnly(feedConfig.showMediaOnly);

				if (cacheConfig.durationMs) {
					const mins = Math.floor(cacheConfig.durationMs / 60000);
					setCacheMins(String(clamp(mins, MIN_CACHE_MINUTES, MAX_CACHE_MINUTES)));
				}
			} catch (e) {
				console.warn('[Settings] Failed to load:', e);
			}
		})();
	}, []);

	async function handleSaveSettings() {
		const trimmedProxy = proxyUrl.trim();
		const finalProxyUrl = trimmedProxy || ENV_PROXY_URL || 'https://reddit-feed-even.plungarini.workers.dev';

		const auth = {
			type: 'cookie' as const,
			tokenV2: token.trim(),
			session: session.trim(),
			userAgent: userAgent.trim() || 'reddit-feed-even/1.0',
		};

		const cacheDurationMs = clamp(Number.parseInt(cacheMins, 10) || 5, MIN_CACHE_MINUTES, MAX_CACHE_MINUTES) * 60 * 1000;

		const feedConfig = {
			endpoint: feed as any,
			limit: 25,
			showMediaOnly,
		};

		// Sync link preview cache TTL with feed cache duration
		await setPreviewCacheTtl(cacheDurationMs);

		// Save via config manager
		await saveSettings({
			auth,
			feed: feedConfig,
			cacheDurationMs,
			apiBaseUrl: finalProxyUrl,
		});

		setToast('Saved! Reloading…');
		setTimeout(() => globalThis.location.reload(), 800);
	}

	return (
		<div className="flex flex-col gap-6 p-4 pb-10">
			<div>
				<SectionHeader title="Authentication" />
				<Card>
					<SettingsGroup label="Reddit credentials">
						<Field label="token_v2" hint="JWT found in Reddit cookies — required for authenticated feeds.">
							<Input type="password" placeholder="eyJhb…" value={token} onChange={(e) => setToken(e.target.value)} />
						</Field>
						<Field label="reddit_session" hint="Session cookie from reddit.com — required alongside token_v2.">
							<Input
								type="password"
								placeholder="Paste session…"
								value={session}
								onChange={(e) => setSession(e.target.value)}
							/>
						</Field>
					</SettingsGroup>
				</Card>
			</div>

			<div>
				<SectionHeader title="App" />
				<Card>
					<SettingsGroup label="Feed preferences">
						<Field label="Default feed sort">
							<Select
								value={feed}
								onValueChange={setFeed}
								options={[
									...Object.entries(ENDPOINTS).map(([key, value]) => ({
										value: key,
										label: `${value.name} - ${value.description}`,
									})),
								]}
							/>
						</Field>
						<Field
							label="Cache duration (minutes)"
							hint={`Posts and link previews are cached for this duration. Min: ${MIN_CACHE_MINUTES}m, Max: ${MAX_CACHE_MINUTES}m (${Math.floor(MAX_CACHE_MINUTES / 60)}h).`}
						>
							<Input
								type="number"
								min={MIN_CACHE_MINUTES}
								max={MAX_CACHE_MINUTES}
								placeholder="5"
								value={cacheMins}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
									const value = e.target.value;
									// Allow empty or valid numbers within range
									if (value === '' || (/^\d+$/.test(value) && parseInt(value, 10) >= MIN_CACHE_MINUTES && parseInt(value, 10) <= MAX_CACHE_MINUTES)) {
										setCacheMins(value);
									}
								}}
							/>
						</Field>
						<Field label="Show posts with media-only" hint="Show posts that have media, even without body text.">
							<Toggle checked={showMediaOnly} onChange={setShowMediaOnly} />
						</Field>
					</SettingsGroup>
				</Card>
			</div>

			<div>
				<SectionHeader title="Advanced" />
				<Card>
					<SettingsGroup label="Expert settings">
						<Field label="Backend Proxy URL" hint="CORS proxy for Reddit API calls (e.g., http://192.168.1.100:3001).">
							<Input
								type="url"
								placeholder="https://reddit-feed-even.plungarini.workers.dev"
								value={proxyUrl}
								onChange={(e) => setProxyUrl(e.target.value)}
							/>
						</Field>
						<Field label="User Agent" hint="User agent for Reddit API calls.">
							<Input
								type="text"
								placeholder="reddit-feed-even/1.0"
								value={userAgent}
								onChange={(e) => setUserAgent(e.target.value)}
							/>
						</Field>
					</SettingsGroup>
				</Card>
			</div>

			{/* Primary save CTA */}
			<Button variant="highlight" onClick={handleSaveSettings} className="w-full h-14 text-[17px]">
				Save Settings
			</Button>

			{/* Danger zone */}
			<section>
				<SectionHeader title="Danger Zone" />
				<div className="flex gap-3">
					<Button
						variant="default"
						onClick={() => {
							void (async () => {
								await clearPreviewCache();
								await clearExpiredEntries();
								setToast('Caches cleared');
								setTimeout(() => globalThis.location.reload(), 500);
							})();
						}}
						className="flex-1"
					>
						Clear Cache
					</Button>
					<Button variant="danger" onClick={clearAll} className="flex-1">
						Reset All
					</Button>
				</div>
			</section>

			{toast && (
				<div className="fixed bottom-24 left-4 right-4 z-50">
					<Toast message={toast} />
				</div>
			)}
		</div>
	);
}
