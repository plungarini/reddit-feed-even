import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';

const evenHudFullReload = (): PluginOption => ({
	name: 'even-hud-full-reload',
	apply: 'serve',
	handleHotUpdate({ server, file }) {
		if (file.endsWith('index.html') || file.includes(`${String.raw`\\`}src${String.raw`\\`}`) || file.includes('/src/')) {
			// Force a full page refresh so the Even bridge reinitializes and redraws the HUD.
			server.ws.send({ type: 'full-reload', path: '*' });
			return [];
		}
	},
});

const getBaseUrl = (command: string) => {
	if (command === 'serve') return './';
	if (process.env.GITHUB_PAGES === 'true') {
		return process.env.STAGING === 'true' ? '/reddit-feed-even/staging/' : '/reddit-feed-even/';
	}
	return './';
};

export default defineConfig(({ command }) => ({
	plugins: [react(), tailwindcss(), evenHudFullReload()],
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
