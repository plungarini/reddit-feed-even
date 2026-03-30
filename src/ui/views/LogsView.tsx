import { Button, Card, EmptyState, Toast, allIcons } from 'even-toolkit/web';
import React, { useEffect, useRef, useState } from 'react';
import { useAppLogs } from '../useAppState';

type LogLevel = 'log' | 'warn' | 'error';

interface LogEntry {
	level: LogLevel;
	msg: string;
	ts: number;
	details?: any[];
}

const LEVEL_LABEL: Record<LogLevel, string> = { log: 'Log', warn: 'Warn', error: 'Error' };
const LEVEL_COLOR: Record<LogLevel, string> = {
	log: 'text-text-dim',
	warn: 'text-accent-warning',
	error: 'text-negative',
};
const LEVEL_BG: Record<LogLevel, string> = {
	log: 'bg-surface',
	warn: 'bg-accent-warning/10',
	error: 'bg-negative/10',
};

const IcChecklist = allIcons['edit-checklist'] as React.FC<React.SVGProps<SVGSVGElement>>;

function formatDetails(details: any[]): string {
	return details
		.map((d, i) => {
			if (d && d._type === 'Error') {
				return `[Error ${i + 1}] ${d.name}: ${d.message}\n${d.stack || ''}`;
			}
			if (d && d._type === 'Response') {
				return `[Response ${i + 1}] ${d.status} ${d.statusText}\nURL: ${d.url}`;
			}
			try {
				return `[Arg ${i + 1}] ${JSON.stringify(d, null, 2)}`;
			} catch {
				return `[Arg ${i + 1}] ${String(d)}`;
			}
		})
		.join('\n\n');
}

function LogItem({ log, index }: { log: LogEntry; index: number }) {
	const [expanded, setExpanded] = useState(false);
	const time = new Date(log.ts).toLocaleTimeString([], { hour12: false });
	const level = (log.level ?? 'log') as LogLevel;
	const hasDetails = log.details && log.details.length > 0;

	return (
		<div className={`mb-2 border-b border-border-light last:border-b-0 ${LEVEL_BG[level]} rounded`}>
			<button
				onClick={() => hasDetails && setExpanded(!expanded)}
				className={`w-full text-left p-2 ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
			>
				<div className="flex items-start gap-2">
					<span className="text-text-dim text-[10px] shrink-0 pt-0.5">[{time}]</span>
					<span className={`${LEVEL_COLOR[level]} uppercase text-[10px] font-bold shrink-0 pt-0.5 min-w-[45px]`}>
						[{log.level}]
					</span>
					<span className="text-text break-all flex-1 text-[11px] font-mono leading-relaxed">{log.msg}</span>
					{hasDetails && <span className="shrink-0 text-text-dim text-[10px]">{expanded ? '▲' : '▼'}</span>}
				</div>
			</button>
			{expanded && hasDetails && (
				<div className="px-2 pb-2">
					<pre className="text-[10px] font-mono text-text-dim bg-black/5 p-2 rounded overflow-x-auto whitespace-pre-wrap">
						{formatDetails(log.details!)}
					</pre>
				</div>
			)}
		</div>
	);
}

export function LogsView() {
	const logs = useAppLogs() as LogEntry[];
	const [filters, setFilters] = useState<Record<LogLevel, boolean>>({
		log: true,
		warn: true,
		error: true,
	});
	const [autoScroll, setAutoScroll] = useState(true);
	const [toast, setToast] = useState('');
	const logsEndRef = useRef<HTMLDivElement>(null);
	const logsContainerRef = useRef<HTMLDivElement>(null);

	function toggleFilter(level: LogLevel) {
		setFilters((f) => ({ ...f, [level]: !f[level] }));
	}

	function clearLogs() {
		if (confirm('Clear all logs?')) {
			globalThis.__debugLogs = [];
			globalThis.__refreshDebug?.();
		}
	}

	async function copyLogs() {
		const text = (globalThis.__debugLogs ?? [])
			.map((l: LogEntry) => {
				const header = `[${l.level.toUpperCase()}] ${l.msg}`;
				if (l.details && l.details.length > 0) {
					return header + '\n' + formatDetails(l.details);
				}
				return header;
			})
			.join('\n\n');
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(text);
				setToast('Copied to clipboard');
			} else {
				// Fallback for environments without clipboard API
				const textarea = document.createElement('textarea');
				textarea.value = text;
				textarea.style.position = 'fixed';
				textarea.style.opacity = '0';
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand('copy');
				document.body.removeChild(textarea);
				setToast('Copied to clipboard');
			}
		} catch (e) {
			console.error('[LogsView] Failed to copy:', e);
			setToast('Copy failed - see console');
		}
		setTimeout(() => setToast(''), 2000);
	}

	const filteredLogs = logs.filter((l) => filters[l.level as LogLevel] ?? true);

	useEffect(() => {
		if (autoScroll && logsEndRef.current && logsContainerRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [filteredLogs, autoScroll]);

	return (
		<div className="flex flex-col h-full p-4 pb-6 gap-3">
			{/* Controls row */}
			<div className="flex gap-2 shrink-0">
				{(['log', 'warn', 'error'] as LogLevel[]).map((level) => (
					<Button
						key={level}
						variant={filters[level] ? 'highlight' : 'secondary'}
						size="sm"
						onClick={() => toggleFilter(level)}
						className="flex-1"
					>
						{LEVEL_LABEL[level]}
					</Button>
				))}
			</div>

			{/* Stats */}
			<div className="text-[10px] text-text-dim shrink-0">
				Showing {filteredLogs.length} of {logs.length} logs (max 100)
			</div>

			{/* Log scroll area */}
			<Card padding="none" className="flex-1 overflow-hidden flex flex-col min-h-[200px]">
				{filteredLogs.length === 0 ? (
					<EmptyState
						icon={<IcChecklist width={32} height={32} />}
						title="No logs"
						description={
							logs.length === 0 ? 'Logs will appear here once the app starts.' : 'Nothing matches the current filters.'
						}
					/>
				) : (
					<div
						ref={logsContainerRef}
						className="flex-1 overflow-y-auto p-3"
						onScroll={(e) => {
							const el = e.currentTarget;
							setAutoScroll(el.scrollHeight - el.scrollTop <= el.clientHeight + 40);
						}}
					>
						{filteredLogs.map((l, i) => (
							<LogItem key={i} log={l} index={i} />
						))}
						<div ref={logsEndRef} />
					</div>
				)}
			</Card>

			<div className="flex gap-2 shrink-0">
				<Button variant="default" onClick={copyLogs} className="px-3 flex-1">
					Copy
				</Button>
				<Button variant="danger" onClick={clearLogs} className="px-3 flex-1">
					Clear
				</Button>
			</div>

			{toast && (
				<div className="fixed bottom-24 left-4 right-4 z-50">
					<Toast message={toast} />
				</div>
			)}
		</div>
	);
}
