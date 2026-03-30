import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const getBaseUrl = (command: string) => {
	if (command === 'serve') return './';
	if (process.env.GITHUB_PAGES === 'true') {
		return process.env.STAGING === 'true' ? '/reddit-feed-even/staging/' : '/reddit-feed-even/';
	}
	return './';
};

export default defineConfig(({ command }) => ({
	plugins: [react(), tailwindcss()],
	base: getBaseUrl(command),
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
				manualChunks(id) {
					if (id.includes('@evenrealities')) {
						return 'even-hub';
					}
				},
			},
		},
	},
}));
