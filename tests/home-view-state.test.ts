import { describe, expect, it } from 'vitest';
import type { WebviewAppState } from '../src/shared/webview-state';
import { DEFAULT_WEBVIEW_APP_STATE } from '../src/shared/webview-state';
import { deriveHomeViewMode } from '../src/ui/views/home-view-state';

function makeState(overrides: Partial<WebviewAppState> = {}): WebviewAppState {
	return {
		...DEFAULT_WEBVIEW_APP_STATE,
		...overrides,
	};
}

describe('deriveHomeViewMode', () => {
	it('returns loading while the feed is starting and no post is active', () => {
		expect(deriveHomeViewMode(makeState({ status: 'loading', activePost: null }))).toBe('loading');
	});

	it('returns preview when the HUD is in detail with an active post', () => {
		expect(
			deriveHomeViewMode(
				makeState({
					status: 'ready',
					view: 'detail',
					activePost: {
						id: 'abc',
						title: 'Post',
						selftext: 'Body',
						author: 'user',
						subreddit: 'test',
						createdUtc: 1,
						score: 42,
						numComments: 8,
						contentType: 'self',
						url: 'https://reddit.com',
						permalink: '/r/test/comments/abc/post',
						preview: undefined,
						thumbnail: undefined,
						galleryImages: undefined,
					},
				}),
			),
		).toBe('preview');
	});

	it('returns error when startup failed and no preview post is available', () => {
		expect(deriveHomeViewMode(makeState({ status: 'error', error: 'Boom' }))).toBe('error');
	});

	it('returns placeholder for the feed view once the app is ready', () => {
		expect(deriveHomeViewMode(makeState({ status: 'ready', view: 'feed', activePost: null }))).toBe('placeholder');
	});
});
