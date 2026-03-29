import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	// Use absolute root for dev (Even Hub WebView needs absolute paths)
	// Use repo-relative path for GitHub Pages builds (Production vs Staging)
	base:
		command === 'serve'
			? './'
			: process.env.GITHUB_PAGES === 'true'
				? process.env.STAGING === 'true'
					? '/reddit-feed-even/staging/'
					: '/reddit-feed-even/'
				: './',
	server: {
		host: true,
		port: 5173,
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
		target: 'es2022',
		rollupOptions: {
			output: {
				manualChunks: {
					'even-hub': ['@evenrealities/even_hub_sdk'],
				},
			},
		},
	},
}));
