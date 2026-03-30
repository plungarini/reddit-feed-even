import { AppShell, NavHeader, allIcons } from 'even-toolkit/web';
import React from 'react';
import { Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LogsView } from './views/LogsView';
import { SettingsView } from './views/SettingsView';
import { StatusView } from './views/StatusView';

type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;

// Even Realities pixel-art icons via the allIcons registry (kebab-case keys)
const IcHome = allIcons['menu-home'] as SvgIcon;
const IcHomeActive = allIcons['menu-home-highlighted'] as SvgIcon;
const IcGear = allIcons['menu-gear'] as SvgIcon;
const IcGearActive = allIcons['menu-gear-highlighted'] as SvgIcon;
const IcChecklist = allIcons['edit-checklist'] as SvgIcon;

const PAGE_TITLES: Record<string, string> = {
	'/': 'App Status',
	'/logs': 'Debug Logs',
	'/settings': 'Settings',
};

interface TabDef {
	id: string;
	label: string;
	Icon: SvgIcon;
	IconActive: SvgIcon;
}

const TABS: TabDef[] = [
	{ id: '/', label: 'Status', Icon: IcHome, IconActive: IcHomeActive },
	{ id: '/logs', label: 'Logs', Icon: IcChecklist, IconActive: IcChecklist },
	{ id: '/settings', label: 'Settings', Icon: IcGear, IconActive: IcGearActive },
];

function BottomNav({ activeId, onNavigate }: { activeId: string; onNavigate: (id: string) => void }) {
	return (
		<nav className="flex items-center border-t border-borde pb-8 pt-4 bg-surface">
			{TABS.map((tab) => {
				const isActive = activeId === tab.id;
				const TabIcon = isActive ? tab.IconActive : tab.Icon;
				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => onNavigate(tab.id)}
						className={[
							'flex-1 flex flex-col items-center justify-center gap-1 py-3 cursor-pointer transition-colors',
							isActive ? 'text-accent' : 'text-text-dim hover:text-text',
						].join(' ')}
					>
						<TabIcon width={35} height={35} />
					</button>
				);
			})}
		</nav>
	);
}

function Layout() {
	const location = useLocation();
	const navigate = useNavigate();
	const title = PAGE_TITLES[location.pathname] ?? 'Reddit G2';

	return (
		<AppShell
			header={<NavHeader title={title} />}
			footer={<BottomNav activeId={location.pathname} onNavigate={navigate} />}
			className="max-w-md mx-auto"
		>
			<Outlet />
		</AppShell>
	);
}

export default function App() {
	return (
		<Routes>
			<Route element={<Layout />}>
				<Route index element={<StatusView />} />
				<Route path="settings" element={<SettingsView />} />
				<Route path="logs" element={<LogsView />} />
			</Route>
		</Routes>
	);
}
