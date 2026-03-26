/**
 * Reddit Client — Backend Proxy Server
 */

import cors from 'cors';
import express from 'express';
import healthRouter from './routes/health.js';
import redditRouter from './routes/reddit.js';

const app = express();
const PORT = Number(process.env.SERVER_PORT ?? 3001);

app.use(cors());
app.use(express.json());

// ─── Request logging ─────────────────────────────────────────────────────────
app.use((req, _res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
	next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api', redditRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
	console.log(`[Server] Reddit proxy running on http://0.0.0.0:${PORT}`);
	console.log(`[Server] Routes: /api/health | /api/test-auth | /api/reddit/*`);
});
