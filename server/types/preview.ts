export interface PreviewData {
	method: 'oembed' | 'linkpreviewnet' | 'peekalink' | 'microlink' | 'scrape' | 'failed';
	url: string;
	title?: string;
	description?: string;
}
