const AUTH_KEY = 'reddit-client-auth';
const CONFIG_KEY = 'reddit-client-config';
const activeFilters = { log: true, warn: true, error: true };

function getBaseUrl() {
	const href = globalThis.location.href;
	const pathname = globalThis.location.pathname;
	if (pathname.includes('http://') || pathname.includes('https://')) {
		const protocol = href.split('://')[0];
		const rest = href.split('://')[1];
		const host = rest.split('/')[0];
		return protocol + '://' + host;
	}
	return globalThis.location.origin;
}

function serverBase() {
	const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
	if (auth.proxyUrl) {
		return auth.proxyUrl.endsWith('/') ? auth.proxyUrl.slice(0, -1) : auth.proxyUrl;
	}
	const env = globalThis.__REDDIT_CLIENT_ENV__ || {};
	if (env.REDDIT_PROXY_URL) {
		return env.REDDIT_PROXY_URL.endsWith('/') ? env.REDDIT_PROXY_URL.slice(0, -1) : env.REDDIT_PROXY_URL;
	}
	return 'http://' + globalThis.location.hostname + ':3001';
}

function fmt(ts) {
	const d = new Date(ts);
	return (
		d.getHours().toString().padStart(2, '0') +
		':' +
		d.getMinutes().toString().padStart(2, '0') +
		':' +
		d.getSeconds().toString().padStart(2, '0')
	);
}

function showToast(msg) {
	const t = document.createElement('div');
	t.className = 'toast';
	t.textContent = msg;
	document.body.appendChild(t);
	setTimeout(function () {
		t.remove();
	}, 2500);
}

// ── Log panel ────────────────────────────────────────────────────────────

function toggleFilter(level) {
	activeFilters[level] = !activeFilters[level];
	const btn = document.getElementById('f-' + level);
	if (activeFilters[level]) {
		btn.className = 'filter-btn active-' + level;
	} else {
		btn.className = 'filter-btn';
	}
	renderLogs();
}

function renderLogs() {
	const panel = document.getElementById('log-panel');
	const logs = (globalThis.__debugLogs || []).filter(function (l) {
		return activeFilters[l.level];
	});
	document.getElementById('log-count').textContent = '(' + (globalThis.__debugLogs || []).length + ')';
	if (logs.length === 0) {
		panel.innerHTML = '<div class="empty-state">No logs yet — waiting for app to start…</div>';
		return;
	}
	const html = logs
		.map(function (l) {
			const escaped = l.msg.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
			return (
				'<div class="log-entry">' +
				'<span class="log-time">' +
				fmt(l.ts) +
				'</span>' +
				'<span class="log-level ' +
				l.level +
				'">' +
				l.level.toUpperCase() +
				'</span>' +
				'<span class="log-msg ' +
				l.level +
				'">' +
				escaped +
				'</span>' +
				'</div>'
			);
		})
		.join('');
	panel.innerHTML = html;
	panel.scrollTop = panel.scrollHeight;
}

function clearLogs() {
	globalThis.__debugLogs = [];
	renderLogs();
}

function scrollLogsBottom() {
	const p = document.getElementById('log-panel');
	p.scrollTop = p.scrollHeight;
}

function copyLogs() {
	const logs = globalThis.__debugLogs || [];
	if (logs.length === 0) {
		showToast('No logs to copy');
		return;
	}

	const text = logs
		.map(function (l) {
			const d = new Date(l.ts);
			const time =
				d.getHours().toString().padStart(2, '0') +
				':' +
				d.getMinutes().toString().padStart(2, '0') +
				':' +
				d.getSeconds().toString().padStart(2, '0');
			return '[' + time + '] [' + l.level.toUpperCase() + '] ' + l.msg;
		})
		.join('\n');

	if (navigator.clipboard) {
		navigator.clipboard
			.writeText(text)
			.then(function () {
				showToast('✅ ' + logs.length + ' logs copied to clipboard');
			})
			.catch(function (err) {
				showToast('Failed to copy: ' + err);
			});
	} else {
		// Fallback for non-HTTPS / LAN IP contexts where clipboard API is unavailable
		var ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.focus();
		ta.select();
		try {
			document.execCommand('copy');
			showToast('✅ ' + logs.length + ' logs copied to clipboard');
		} catch (err) {
			showToast('Failed to copy: ' + err);
		}
		document.body.removeChild(ta);
	}
}

// ── State display ────────────────────────────────────────────────────────

function renderState() {
	const s = globalThis.__appState || {};

	// Status badge
	const badge = document.getElementById('status-badge');
	const statusMap = {
		starting: ['pending', 'Starting…'],
		loading: ['pending', 'Loading feed…'],
		ready: ['ok', 'Ready ✓'],
		error: ['error', 'Error ✗'],
		no_auth: ['pending', 'Setup required'],
		auth_fail: ['error', 'Auth failed'],
	};
	const b = statusMap[s.status] || ['pending', s.status || '…'];
	badge.className = 'badge ' + b[0];
	badge.textContent = b[1];

	// Stats
	let statusClass = 'muted';
	if (s.status === 'ready') statusClass = 'ok';
	else if (s.status === 'error' || s.status === 'auth_fail') statusClass = 'error';

	set('st-status', s.status || '—', statusClass);
	set('st-bridge', s.bridgeReady ? 'connected' : 'waiting', s.bridgeReady ? 'ok' : 'muted');
	set('st-posts', String(s.posts || 0), s.posts > 0 ? 'ok' : 'muted');
	set('st-view', s.view || '—', 'muted');
	set('st-auth', s.hasAuth ? 'token set' : 'no token', s.hasAuth ? 'ok' : 'error');

	// Error box
	const eb = document.getElementById('error-box');
	if (s.error) {
		eb.textContent = s.error;
		eb.className = 'error-box visible';
	} else {
		eb.className = 'error-box';
	}
}

function set(id, val, cls) {
	const el = document.getElementById(id);
	if (!el) return;
	el.textContent = val;
	el.className = 'stat-value ' + (cls || 'muted');
}

// ── Server health ────────────────────────────────────────────────────────

async function checkServer() {
	const url = serverBase() + '/api/health';
	document.getElementById('server-url-display').textContent = serverBase();
	Object.assign(globalThis.__appState, { serverUrl: serverBase() });
	try {
		const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
		const ok = r.ok;
		document.getElementById('server-dot').className = 'dot ' + (ok ? 'ok' : 'error');
		set('st-server', ok ? 'online' : 'error ' + r.status, ok ? 'ok' : 'error');
	} catch (e) {
		document.getElementById('server-dot').className = 'dot error';
		set('st-server', 'offline', 'error');
		console.warn('[Debug] Server health check failed:', String(e));
	}
}

// ── Settings ─────────────────────────────────────────────────────────────

function loadSettings() {
	try {
		const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
		const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
		if (auth.tokenV2) document.getElementById('input-token').value = auth.tokenV2;
		if (auth.session) document.getElementById('input-session').value = auth.session;
		if (auth.proxyUrl) {
			document.getElementById('input-proxy').value = auth.proxyUrl;
		} else {
			const env = globalThis.__REDDIT_CLIENT_ENV__ || {};
			if (env.REDDIT_PROXY_URL) document.getElementById('input-proxy').value = env.REDDIT_PROXY_URL;
		}
		if (cfg.feed) {
			document.getElementById('input-feed').value = cfg.feed.endpoint || 'hot';
			/* document.getElementById('input-subreddit').value = cfg.feed.subreddit || ''; */
		}
		if (cfg.cache) {
			const mins = cfg.cache.durationMs ? Math.round(cfg.cache.durationMs / 60000) : 5;
			document.getElementById('input-cache').value = String(mins);
		}
		Object.assign(globalThis.__appState, { hasAuth: !!(auth.tokenV2 && auth.session) });
	} catch (e) {
		console.error('[Debug] Failed to load settings:', e);
	}
}

function saveSettings() {
	const token = document.getElementById('input-token')?.value.trim();
	const session = document.getElementById('input-session')?.value.trim();
	const proxy = document.getElementById('input-proxy')?.value.trim();
	const endpoint = document.getElementById('input-feed')?.value;
	const subreddit = document.getElementById('input-subreddit')?.value.trim();

	const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
	auth.proxyUrl = proxy;

	if (token && session) {
		auth.tokenV2 = token;
		auth.session = session;
		auth.userAgent = 'reddit-client-even/1.0';
		auth.savedAt = new Date().toISOString();
	} else if (token || session) {
		alert('Both token_v2 and reddit_session are required to authenticate.');
		return;
	}
	localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
	const rawCacheMins = parseInt(document.getElementById('input-cache')?.value, 10);
	const cacheMins = isNaN(rawCacheMins) || rawCacheMins < 1 ? 5 : rawCacheMins;
	const cfg = { feed: { endpoint: endpoint, subreddit: subreddit, limit: 25, time: 'day' }, cache: { durationMs: cacheMins * 60 * 1000 } };
	localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));

	Object.assign(globalThis.__appState, { hasAuth: !!token });
	renderState();
	showToast('✅ Settings saved - Reloading app in 3s');

	setTimeout(() => {
		globalThis.location.reload();
	}, 3000);
}

function clearAll() {
	if (!confirm('Clear all saved auth and settings?')) return;
	localStorage.removeItem(AUTH_KEY);
	localStorage.removeItem(CONFIG_KEY);
	document.getElementById('input-token').value = '';
	document.getElementById('input-session').value = '';
	Object.assign(globalThis.__appState, { hasAuth: false });
	renderState();
	showToast('🗑 Cleared — reload to restart');
}

async function testAuth() {
	const token = document.getElementById('input-token').value.trim();
	const session = document.getElementById('input-session').value.trim();

	if (!token) {
		showToast('No token entered');
		return;
	}

	showToast('Testing auth...');

	try {
		const headers = {
			'X-Reddit-Token': token,
			'X-Reddit-User-Agent': 'reddit-client-even/1.0',
		};
		if (session) headers['X-Reddit-Session'] = session;

		const response = await fetch(serverBase() + '/api/test-auth', { headers });
		const data = await response.json();

		if (data.authenticated) {
			showToast('✓ Auth working! User: u/' + data.username);
		} else {
			showToast('✗ Auth failed: ' + (data.error || 'Unknown error'));
		}
	} catch (err) {
		showToast('Auth test error: ' + err.message);
	}
}

function clearCache() {
	if (!confirm('Clear in-memory cache and reload posts?')) return;
	showToast('🧼 Reloading…');
	setTimeout(function () { globalThis.location.reload(); }, 500);
}

// ── Boot ─────────────────────────────────────────────────────────────────

globalThis.__refreshDebug = function () {
	renderLogs();
	renderState();
};

globalThis.addEventListener('DOMContentLoaded', function () {
	loadSettings();
	renderState();
	renderLogs();
	checkServer();
	// Re-check server every 10 s
	globalThis.setInterval(checkServer, 10000);
});
