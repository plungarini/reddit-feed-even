import { Badge, Card, SectionHeader, StatGrid, StatusDot } from 'even-toolkit/web';
import { useAppState } from '../useAppState';

export function StatusView() {
	const state = useAppState();

	const status: string = state.status ?? 'starting';

	let badgeVariant: 'positive' | 'negative' | 'accent' | 'neutral' = 'neutral';
	if (status === 'starting' || status === 'loading') badgeVariant = 'accent';
	else if (status === 'error') badgeVariant = 'negative';
	else if (status === 'ready') badgeVariant = 'positive';

	return (
		<div className="flex flex-col gap-6 p-4 pb-10">
			{/* Connection */}
			<section className="flex flex-col gap-4">
				<SectionHeader title="Connection" />
				<StatGrid
					columns={2}
					stats={[
						{
							label: 'Bridge',
							value: state.bridgeReady ? '✓' : '…',
							detail: state.bridgeReady ? 'Connected' : 'Waiting',
						},
						{
							label: 'Auth',
							value: state.hasAuth ? '✓' : '✗',
							detail: state.hasAuth ? 'Authenticated' : 'Missing',
						},
					]}
				/>

				{/* Status hero */}
				<Card padding="default" className="flex items-center justify-between">
					<div>
						<Badge variant={badgeVariant} className="text-[13px] px-3 py-1">
							{status}
						</Badge>
					</div>
					<StatusDot connected={status === 'ready'} />
				</Card>

				{/* Error banner */}
				{state.error && (
					<Card padding="default" className="bg-negative-alpha">
						<p className="text-detail text-text-dim mb-1 uppercase tracking-wide">Error</p>
						<p className="text-normal-body text-negative">{state.error}</p>
					</Card>
				)}
			</section>

			{/* Feed stats */}
			<section>
				<SectionHeader title="Feed" />
				<StatGrid
					columns={3}
					stats={[
						{
							label: 'View',
							value: state.view ?? '—',
						},
						{
							label: 'Posts',
							value: String(state.posts ?? 0),
						},
						{
							label: 'Page',
							value: state.page !== undefined ? String(state.page + 1) : '—',
						},
					]}
				/>
			</section>
		</div>
	);
}
