import { Button, Card, Input, SectionHeader, Select, SettingsGroup, Toast, Toggle } from 'even-toolkit/web';
import React, { useEffect, useState } from 'react';
import { ENDPOINTS } from '../../core/config';

const AUTH_KEY = 'reddit-feed-auth';
const CONFIG_KEY = 'reddit-feed-config';
const PROXY_URL = (globalThis as any)?.__REDDIT_CLIENT_ENV__?.REDDIT_PROXY_URL;

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
		localStorage.removeItem(AUTH_KEY);
		localStorage.removeItem(CONFIG_KEY);
		globalThis.location.reload();
	}
}

export function SettingsView() {
	const [token, setToken] = useState('');
	const [session, setSession] = useState('');
	const [proxy, setProxy] = useState(PROXY_URL);
	const [feed, setFeed] = useState('hot');
	const [cacheMins, setCacheMins] = useState('5');
	const [showMediaOnly, setShowMediaOnly] = useState(false);
	const [toast, setToast] = useState('');
	const [userAgent, setUserAgent] = useState('reddit-feed-even/1.0');

	useEffect(() => {
		try {
			const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
			const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
			if (auth.tokenV2) setToken(auth.tokenV2);
			if (auth.session) setSession(auth.session);
			if (auth.proxyUrl) setProxy(auth.proxyUrl || PROXY_URL);
			if (auth.userAgent) setUserAgent(auth.userAgent || 'reddit-feed-even/1.0');
			if (config.feed?.endpoint) setFeed(config.feed.endpoint);
			if (config.feed?.showMediaOnly !== undefined) setShowMediaOnly(config.feed.showMediaOnly);
			if (config.cache?.durationMs) setCacheMins(String(Math.max(1, Math.floor(config.cache.durationMs / 60000))));
		} catch (e) {
			console.warn('[Settings] Failed to load:', e);
		}
	}, []);

	function saveSettings() {
		const auth = {
			tokenV2: token.trim(),
			session: session.trim(),
			proxyUrl: proxy.trim() || PROXY_URL,
			userAgent: userAgent.trim() || 'reddit-feed-even/1.0',
		};
		const config = {
			feed: { endpoint: feed, limit: 25, showMediaOnly },
			cache: { durationMs: (Number.parseInt(cacheMins, 10) || 5) * 60 * 1000 },
		};
		localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
		localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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
							hint="Posts are reused for this long before re-fetching. Minimum 1 minute."
						>
							<Input
								type="number"
								min="1"
								max="60"
								placeholder="5"
								value={cacheMins}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCacheMins(e.target.value)}
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
						<Field label="Backend Proxy URL" hint="CORS proxy for Reddit API calls.">
							<Input
								type="url"
								placeholder="https://my-proxy.workers.dev"
								value={proxy}
								onChange={(e) => setProxy(e.target.value)}
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
			<Button variant="highlight" onClick={saveSettings} className="w-full h-14 text-[17px]">
				Save Settings
			</Button>

			{/* Danger zone */}
			<section>
				<SectionHeader title="Danger Zone" />
				<div className="flex gap-3">
					<Button variant="default" onClick={() => globalThis.location.reload()} className="flex-1">
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
