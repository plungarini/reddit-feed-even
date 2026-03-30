import { useEffect, useState } from 'react';

interface LogEntry {
	level: 'log' | 'warn' | 'error';
	msg: string;
	ts: number;
	details?: any[];
}

declare global {
	var __refreshDebug: (() => void) | undefined;
	var __appState: any;
	var __debugLogs: LogEntry[];
}

export function useAppState() {
	const [state, setState] = useState(globalThis.__appState || { status: 'starting' });

	useEffect(() => {
		const handleRefresh = () => {
			setState({ ...globalThis.__appState });
		};
		globalThis.__refreshDebug = handleRefresh;
		// return () => { globalThis.__refreshDebug = undefined; };
	}, []);

	return state;
}

export function useAppLogs() {
	const [logs, setLogs] = useState<any[]>(globalThis.__debugLogs || []);

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
