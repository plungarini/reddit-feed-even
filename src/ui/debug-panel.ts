export {};

/**
 * Debug Panel Logic
 *
 * Handles settings, logs, and state updates for the Reddit client.
 */

const AUTH_KEY = 'reddit-feed-auth';
const CONFIG_KEY = 'reddit-feed-config';

declare global {
	var __refreshDebug: (() => void) | undefined;
	var __appState: any;
	var __debugLogs: any[];
	var switchTab: (tabId: string) => void;
	var saveSettings: () => void;
	var clearAll: () => void;
	var clearCache: () => void;
	var toggleFilter: (level: string) => void;
	var clearLogs: () => void;
	var copyLogs: () => void;
}

// ─── Initialization ─────────────────────────────────────────────────────────

function init() {
	loadSettings();
	renderState();

	// Wire up log updates
	globalThis.__refreshDebug = () => {
		refreshLogs();
		renderState();
	};

	// Switch to status tab by default
	switchTab('status');
}

// ─── Tab Management ──────────────────────────────────────────────────────────

globalThis.switchTab = function (tabId) {
	// Update views
	document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
	document.getElementById(`view-${tabId}`)?.classList.add('active');

	// Update nav
	document.querySelectorAll('.nav-item').forEach((v) => v.classList.remove('active'));
	document.getElementById(`nav-${tabId}`)?.classList.add('active');
};

// ─── Settings ───────────────────────────────────────────────────────────────

function loadSettings() {
	try {
		const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
		const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');

		if (auth.tokenV2) (document.getElementById('input-token') as HTMLInputElement).value = auth.tokenV2;
		if (auth.session) (document.getElementById('input-session') as HTMLInputElement).value = auth.session;
		if (auth.proxyUrl) (document.getElementById('input-proxy') as HTMLInputElement).value = auth.proxyUrl;

		if (config.feed?.endpoint)
			(document.getElementById('input-feed') as unknown as HTMLSelectElement).value = config.feed.endpoint;
		if (config.cache?.durationMs) {
			const mins = Math.floor(config.cache.durationMs / 60000);
			(document.getElementById('input-cache') as HTMLInputElement).value = String(mins);
		}
	} catch (e) {
		console.warn('[Debug] Failed to load settings:', e);
	}
}

// @ts-ignore - Attached to globalThis for HTML onclick handlers
globalThis.saveSettings = function () {
	const token = (document.getElementById('input-token') as HTMLInputElement).value.trim();
	const session = (document.getElementById('input-session') as HTMLInputElement).value.trim();
	const proxy = (document.getElementById('input-proxy') as HTMLInputElement).value.trim();
	const endpoint = (document.getElementById('input-feed') as unknown as HTMLSelectElement).value;
	const cacheMins = Number.parseInt((document.getElementById('input-cache') as HTMLInputElement).value) || 5;

	const auth = {
		tokenV2: token,
		session: session,
		proxyUrl: proxy,
		userAgent: 'reddit-feed-even/1.0',
	};

	const config = {
		feed: { endpoint, limit: 25 },
		cache: { durationMs: cacheMins * 60 * 1000 },
	};

	localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
	localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

	showToast('Settings saved!');
	setTimeout(() => window.location.reload(), 1000);
};

globalThis.clearAll = function () {
	if (confirm('Are you sure you want to reset everything?')) {
		localStorage.removeItem(AUTH_KEY);
		localStorage.removeItem(CONFIG_KEY);
		window.location.reload();
	}
};

globalThis.clearCache = function () {
	// Simply reloading clears the in-memory PostStore cache
	globalThis.location.reload();
};

// ─── State Rendering ─────────────────────────────────────────────────────────

function renderState() {
	const state = globalThis.__appState;
	if (!state) return;

	const sStatus = document.getElementById('st-status');
	const sView = document.getElementById('st-view');
	const sPosts = document.getElementById('st-posts');
	const sAuth = document.getElementById('st-auth');
	const sBridge = document.getElementById('st-bridge');
	const sBadge = document.getElementById('status-badge');
	const errBox = document.getElementById('error-box');

	if (sStatus) sStatus.textContent = state.status;
	if (sView) sView.textContent = state.view;
	if (sPosts) sPosts.textContent = String(state.posts);
	if (sAuth) sAuth.textContent = state.hasAuth ? 'token set' : 'none';
	if (sBridge) sBridge.textContent = state.bridgeReady ? 'connected' : 'waiting';

	if (sBadge) {
		sBadge.textContent = state.status;
		sBadge.className = `status-indicator ${state.status}`;
	}

	if (errBox) {
		if (state.error) {
			errBox.textContent = state.error;
			errBox.style.display = 'block';
		} else {
			errBox.style.display = 'none';
		}
	}
}

// ─── Log Management ──────────────────────────────────────────────────────────

const activeFilters: Record<string, boolean> = { log: true, warn: true, error: true };

globalThis.toggleFilter = function (level) {
	activeFilters[level] = !activeFilters[level];
	document.getElementById(`f-${level}`)?.classList.toggle('active', activeFilters[level]);
	refreshLogs();
};

function refreshLogs() {
	const panel = document.getElementById('log-panel');
	if (!panel) return;

	const logs = (globalThis as any).__debugLogs || [];
	const filtered = logs.filter((l: any) => activeFilters[l.level]);

	panel.innerHTML = filtered
		.map((l: any) => {
			const time = new Date(l.ts).toLocaleTimeString([], {
				hour12: false,
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			});
			return `<div class="log-entry">
      <span class="log-time">[${time}]</span>
      <span class="log-level ${l.level}">[${l.level.toUpperCase()}]</span>
      <span class="log-msg">${l.msg}</span>
    </div>`;
		})
		.join('');

	const counter = document.getElementById('log-count');
	if (counter) counter.textContent = `(${logs.length})`;

	// Auto-scroll
	panel.scrollTop = panel.scrollHeight;
}

globalThis.clearLogs = function () {
	globalThis.__debugLogs = [];
	refreshLogs();
};

globalThis.copyLogs = function () {
	const text = globalThis.__debugLogs.map((l) => `[${l.level.toUpperCase()}] ${l.msg}`).join('\n');
	navigator.clipboard.writeText(text).then(() => showToast('Logs copied!'));
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function showToast(msg: string) {
	const t = document.createElement('div');
	t.className = 'toast';
	t.textContent = msg;
	document.body.appendChild(t);
	setTimeout(() => t.remove(), 2500);
}

// Start
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
