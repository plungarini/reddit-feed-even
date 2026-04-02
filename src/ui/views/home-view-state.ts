import type { WebviewAppState } from '../../shared/webview-state';

export type HomeViewMode = 'loading' | 'error' | 'placeholder' | 'preview';

export function deriveHomeViewMode(state: WebviewAppState): HomeViewMode {
	const isPreviewView = state.view === 'detail' || state.view === 'comments';
	if (isPreviewView && state.activePost) return 'preview';
	if (state.status === 'error') return 'error';
	if (state.status === 'starting' || state.status === 'loading') return 'loading';
	return 'placeholder';
}
