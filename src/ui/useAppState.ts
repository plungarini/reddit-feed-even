import { useEffect, useState } from 'react';
import { DEFAULT_WEBVIEW_APP_STATE, type DebugLogEntry, type WebviewAppState } from '../shared/webview-state';

export function useAppState() {
	const [state, setState] = useState<WebviewAppState>(globalThis.__appState || DEFAULT_WEBVIEW_APP_STATE);

	useEffect(() => {
		const handleRefresh = () => {
			setState({ ...DEFAULT_WEBVIEW_APP_STATE, ...globalThis.__appState });
		};
		globalThis.__refreshDebug = handleRefresh;
		// return () => { globalThis.__refreshDebug = undefined; };
	}, []);

	return state;
}

export function useAppLogs() {
	const [logs, setLogs] = useState<DebugLogEntry[]>(globalThis.__debugLogs || []);

	useEffect(() => {
		const handleRefresh = globalThis.__refreshDebug;
		globalThis.__refreshDebug = () => {
			setLogs([...(globalThis.__debugLogs || [])]);
			if (handleRefresh) handleRefresh();
		};
		// return
	}, []);

	return logs;
}
