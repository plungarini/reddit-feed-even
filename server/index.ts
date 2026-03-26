/**
 * Reddit Client — Backend Proxy Server
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import healthRouter from './routes/health.js';
import redditRouter from './routes/reddit.js';

const app = new Hono();
const PORT = Number(process.env.SERVER_PORT ?? 3001);

app.use('*', cors());

// ─── Request logging ─────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
	console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path}`);
	await next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.route('/api/health', healthRouter);
app.route('/api', redditRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
console.log(`[Server] Reddit proxy starting on http://0.0.0.0:${PORT}`);
console.log(`[Server] Routes: /api/health | /api/test-auth | /api/reddit/*`);

serve({
	fetch: app.fetch,
	port: PORT,
});
