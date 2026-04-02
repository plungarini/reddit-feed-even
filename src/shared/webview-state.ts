import type { RedditPost, ViewMode } from '../core/types';

export type AppStatus = 'starting' | 'loading' | 'ready' | 'error';

export interface ActivePostPreview
	extends Pick<
		RedditPost,
		| 'id'
		| 'title'
		| 'selftext'
		| 'author'
		| 'subreddit'
		| 'createdUtc'
		| 'score'
		| 'numComments'
		| 'contentType'
		| 'url'
		| 'permalink'
		| 'preview'
		| 'thumbnail'
		| 'galleryImages'
	> {}

export interface WebviewAppState {
	status: AppStatus;
	view: ViewMode;
	posts: number;
	error: string | null;
	bridgeReady: boolean;
	hasAuth: boolean;
	page: number;
	highlight: number;
	activePost: ActivePostPreview | null;
}

export interface DebugLogEntry {
	level: 'log' | 'warn' | 'error';
	msg: string;
	ts: number;
	details?: unknown[];
}

export const DEFAULT_WEBVIEW_APP_STATE: WebviewAppState = {
	status: 'starting',
	view: 'feed',
	posts: 0,
	error: null,
	bridgeReady: false,
	hasAuth: false,
	page: 0,
	highlight: 0,
	activePost: null,
};

declare global {
	var __refreshDebug: (() => void) | undefined;
	var __appState: WebviewAppState;
	var __debugLogs: DebugLogEntry[];
}

export function createActivePostPreview(post: ActivePostPreview): ActivePostPreview {
	return {
		id: post.id,
		title: post.title,
		selftext: post.selftext,
		author: post.author,
		subreddit: post.subreddit,
		createdUtc: post.createdUtc,
		score: post.score,
		numComments: post.numComments,
		contentType: post.contentType,
		url: post.url,
		permalink: post.permalink,
		preview: post.preview,
		thumbnail: post.thumbnail,
		galleryImages: post.galleryImages,
	};
}

export {};
