import { Badge, Card, Loading, SectionHeader, Skeleton, allIcons } from 'even-toolkit/web';
import { IcFeatWiki } from 'even-toolkit/web/icons/svg-icons';
import React, { useEffect, useState } from 'react';
import { loadLinkPreview, type LinkPreviewData } from '../../api/link-preview';
import { getApiBaseUrl } from '../../core/config-manager';
import { fmtScore, fmtTimeAgo, normalizeWebText, splitTextWithLinks } from '../../shared/utils';
import type { ActivePostPreview } from '../../shared/webview-state';
import { useAppState } from '../useAppState';
import { deriveHomeViewMode } from './home-view-state';

type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;

const IcScore = allIcons['status-good'] as SvgIcon;
const IcComments = allIcons['feat-message'] as SvgIcon;
const IcExternal = allIcons['edit-share'] as SvgIcon;

function buildPermalinkUrl(permalink: string): string {
	if (!permalink) return 'https://www.reddit.com';
	if (permalink.startsWith('http://') || permalink.startsWith('https://')) return permalink;
	return `https://www.reddit.com${permalink.startsWith('/') ? permalink : `/${permalink}`}`;
}

function getMediaPreview(post: ActivePostPreview): { src: string; label: string } | null {
	if (post.contentType === 'image') {
		return { src: post.preview || post.url, label: 'Image preview' };
	}

	if ((post.contentType === 'video' || post.contentType === 'gallery') && post.preview) {
		return {
			src: post.preview,
			label: post.contentType === 'video' ? 'Video poster' : 'Gallery preview',
		};
	}

	return null;
}

function getGalleryImages(post: ActivePostPreview): string[] {
	if (post.contentType !== 'gallery') return [];
	if (post.galleryImages && post.galleryImages.length > 0) return post.galleryImages;
	return post.preview ? [post.preview] : [];
}

function getLinkPreviewImage(post: ActivePostPreview, preview: LinkPreviewData | null): string | null {
	if (preview?.image) return preview.image;
	if (post.preview) return post.preview;
	if (post.thumbnail && /^https?:\/\//.test(post.thumbnail)) return post.thumbnail;
	return null;
}

function LoadingState() {
	return (
		<div className="flex flex-col gap-4 p-4 pb-10">
			<SectionHeader title="Home" />
			<Card padding="default" className="flex flex-col gap-3">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-6 w-full" />
				<Skeleton className="h-6 w-5/6" />
				<Skeleton className="h-40 w-full rounded-[6px]" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-4/5" />
			</Card>
			<Card padding="default" className="flex items-center gap-3">
				<Loading size={18} />
				<div>
					<p className="text-normal-title text-text">Loading</p>
					<p className="text-detail text-text-dim">Fetching your feed preview.</p>
				</div>
			</Card>
		</div>
	);
}

function EmptyFeedState() {
	return (
		<div className="flex flex-col gap-4 p-4 pb-10">
			<SectionHeader title="Home" />
			<Card
				padding="default"
				className="flex flex-col h-[60dvh] bg-transparent! items-center justify-center border border-dashed border-text-dim gap-3"
			>
				<IcFeatWiki width={35} height={35} />
				<p className="text-normal-title text-text">Waiting for a post</p>
				<p className="text-normal-body text-text-dim -mt-2">Select a post to view details.</p>
			</Card>
		</div>
	);
}

function ErrorState({ message }: { message: string | null }) {
	return (
		<div className="flex flex-col gap-4 p-4 pb-10">
			<SectionHeader title="Home" />
			<Card padding="default" className="bg-negative-alpha flex flex-col gap-2">
				<p className="text-detail uppercase tracking-wide text-text-dim">Preview unavailable</p>
				<p className="text-normal-body text-negative">{message || 'The app hit an error while loading the feed.'}</p>
				<p className="text-detail text-text-dim">
					Check Status for runtime details or Settings for auth and proxy configuration.
				</p>
			</Card>
		</div>
	);
}

function LinkifiedBody({ text }: { text: string }) {
	const segments = splitTextWithLinks(text);

	return (
		<p className="text-normal-body text-text whitespace-pre-wrap break-words">
			{segments.map((segment, index) =>
				segment.type === 'link' ? (
					<a
						key={`body-link-${index}`}
						href={segment.href}
						target="_blank"
						rel="noopener noreferrer"
						className="underline decoration-text-dim underline-offset-2 hover:text-accent"
					>
						{segment.content}
					</a>
				) : (
					<React.Fragment key={`body-text-${index}`}>{segment.content}</React.Fragment>
				),
			)}
		</p>
	);
}

function LinkPreviewCard({ post, apiBaseUrl }: { post: ActivePostPreview; apiBaseUrl: string | null }) {
	const [preview, setPreview] = useState<LinkPreviewData | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		let cancelled = false;

		if (post.contentType !== 'link') {
			setPreview(null);
			setLoading(false);
			return () => {
				cancelled = true;
			};
		}

		setPreview(null);
		setLoading(true);
		loadLinkPreview(post.url, apiBaseUrl)
			.then((data) => {
				if (!cancelled) {
					setPreview(data);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [apiBaseUrl, post.contentType, post.url]);

	if (post.contentType !== 'link') return null;

	const previewImage = getLinkPreviewImage(post, preview);

	return (
		<a href={post.url} target="_blank" rel="noopener noreferrer" className="block">
			<Card padding="default" className="flex flex-col gap-3 transition-opacity hover:opacity-90">
				<div className="flex items-center justify-between gap-2">
					<p className="text-detail uppercase tracking-wide text-text-dim">Link preview</p>
					<div className="flex items-center gap-2">
						{preview?.domain && <Badge variant="neutral">{preview.domain}</Badge>}
						<IcExternal width={16} height={16} className="text-text-dim" />
					</div>
				</div>
				{previewImage && (
					<div className="overflow-hidden rounded-[6px] border border-border-light bg-surface-light">
						<img
							src={previewImage}
							alt={preview?.title || preview?.domain || 'Link preview'}
							className="h-auto w-full object-cover"
							loading="lazy"
						/>
					</div>
				)}
				{loading && !preview ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-4 w-1/3" />
						<Skeleton className="h-5 w-full" />
						<Skeleton className="h-4 w-5/6" />
					</div>
				) : (
					<>
						<p className="text-normal-title text-text break-words">
							{preview?.title || preview?.domain || 'External link'}
						</p>
						<p className="text-normal-body text-text-dim break-words">{preview?.description || post.url}</p>
					</>
				)}
			</Card>
		</a>
	);
}

function PostPreview({ post, apiBaseUrl }: { post: ActivePostPreview; apiBaseUrl: string | null }) {
	const normalizedBody = post.selftext ? normalizeWebText(post.selftext) : '';
	const media = getMediaPreview(post);
	const galleryImages = getGalleryImages(post);
	const badgeLabel =
		post.contentType === 'self' ? 'Text' : post.contentType.charAt(0).toUpperCase() + post.contentType.slice(1);

	return (
		<div className="flex flex-col gap-4 p-4 pb-10">
			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<SectionHeader title="Home" />
					<Badge variant="accent">{badgeLabel}</Badge>
				</div>
				<Card padding="default" className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-2 text-detail text-text-dim">
						<span>r/{post.subreddit}</span>
					</div>
					<h2 className="text-[20px] leading-tight tracking-[-0.2px] text-text break-words">{post.title}</h2>
					{post.contentType === 'gallery' && galleryImages.length > 0 ? (
						<div className={galleryImages.length === 1 ? '' : 'grid grid-cols-2 gap-2'}>
							{galleryImages.map((src, index) => (
								<div
									key={`${post.id}-gallery-${index}`}
									className="overflow-hidden rounded-[6px] border border-border-light bg-surface-light"
								>
									<img
										src={src}
										alt={`Gallery image ${index + 1}`}
										className="h-auto w-full object-cover"
										loading="lazy"
									/>
								</div>
							))}
						</div>
					) : media ? (
						<div className="overflow-hidden rounded-[6px] border border-border-light bg-surface-light">
							<img src={media.src} alt={media.label} className="h-auto w-full object-cover" loading="lazy" />
						</div>
					) : null}
					{normalizedBody && <LinkifiedBody text={normalizedBody} />}
					<div className="flex items-end justify-between gap-2">
						<div className="text-detail text-text-dim">
							u/{post.author} • {fmtTimeAgo(post.createdUtc)}
						</div>
						<div className="flex items-center gap-2">
							<Badge variant="neutral" className="inline-flex items-center gap-1" title="Upvotes" aria-label="Upvotes">
								<IcScore width={14} height={14} />
								<span>{fmtScore(post.score)}</span>
							</Badge>
							<Badge
								variant="neutral"
								className="inline-flex items-center gap-1"
								title="Comments"
								aria-label="Comments"
							>
								<IcComments width={14} height={14} />
								<span>{fmtScore(post.numComments)}</span>
							</Badge>
						</div>
					</div>
				</Card>
			</section>

			<LinkPreviewCard post={post} apiBaseUrl={apiBaseUrl} />

			<a
				href={buildPermalinkUrl(post.permalink)}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex min-h-12 items-center justify-center rounded-[6px] bg-accent px-4 py-3 text-normal-title text-text-highlight transition-opacity hover:opacity-90"
			>
				Open on Reddit
			</a>
		</div>
	);
}

export function HomeView() {
	const state = useAppState();
	const mode = deriveHomeViewMode(state);
	const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		void getApiBaseUrl()
			.then((value) => {
				if (!cancelled) {
					setApiBaseUrl(value);
				}
			})
			.catch((error) => {
				console.warn('[HomeView] Failed to load API base URL from config:', error);
				if (!cancelled) {
					setApiBaseUrl(null);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	if (mode === 'loading') return <LoadingState />;
	if (mode === 'error') return <ErrorState message={state.error} />;
	if (mode === 'preview' && state.activePost) {
		return <PostPreview post={state.activePost} apiBaseUrl={apiBaseUrl} />;
	}

	return <EmptyFeedState />;
}
