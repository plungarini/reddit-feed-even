import { Button, Card, EmptyState, Toast, allIcons } from 'even-toolkit/web';
import React, { useEffect, useRef, useState } from 'react';
import { useAppLogs } from '../useAppState';

type LogLevel = 'log' | 'warn' | 'error';

const LEVEL_LABEL: Record<LogLevel, string> = { log: 'Log', warn: 'Warn', error: 'Error' };
const LEVEL_COLOR: Record<LogLevel, string> = {
	log: 'text-text-dim',
	warn: 'text-accent-warning',
	error: 'text-negative',
};

const IcChecklist = allIcons['edit-checklist'] as React.FC<React.SVGProps<SVGSVGElement>>;

export function LogsView() {
	const logs = useAppLogs();
	const [filters, setFilters] = useState<Record<LogLevel, boolean>>({
		log: true,
		warn: true,
		error: true,
	});
	const [autoScroll, setAutoScroll] = useState(true);
	const [toast, setToast] = useState('');
	const logsEndRef = useRef<HTMLDivElement>(null);

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
		const text = (globalThis.__debugLogs ?? []).map((l) => `[${l.level.toUpperCase()}] ${l.msg}`).join('\n');
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
		if (autoScroll && logsEndRef.current) {
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
						className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed select-text"
						onScroll={(e) => {
							const el = e.currentTarget;
							setAutoScroll(el.scrollHeight - el.scrollTop <= el.clientHeight + 40);
						}}
					>
						{filteredLogs.map((l, i) => {
							const time = new Date(l.ts).toLocaleTimeString([], {
								hour12: false,
							});
							const level = (l.level ?? 'log') as LogLevel;
							return (
								<div key={i} className="mb-2 pb-2 border-b border-border-light last:border-b-0">
									<span className="text-text-dim mr-1">[{time}]</span>
									<span className={`${LEVEL_COLOR[level]} uppercase mr-2`}>[{l.level}]</span>
									<span className="text-text break-all">{l.msg}</span>
								</div>
							);
						})}
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
