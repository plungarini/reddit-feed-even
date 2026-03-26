import { Hono } from 'hono';
import { cors } from 'hono/cors';
import healthRouter from './routes/health';
import redditRouter from './routes/reddit';

const app = new Hono();

app.use('*', cors());

// ─── Request logging ─────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
	console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path}`);
	await next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.route('/api/health', healthRouter);
app.route('/api', redditRouter);

export default app;
