import { Hono } from 'hono';
import { cors } from 'hono/cors';
import healthRouter from './routes/health';
import previewRouter from './routes/preview';
import redditRouter from './routes/reddit';

const app = new Hono();

app.use('*', cors());

// ─── Routes ──────────────────────────────────────────────────────────────────
app.route('/api/health', healthRouter);
app.route('/api/reddit', redditRouter);
app.route('/api/preview', previewRouter);
app.route('/', healthRouter);

export default app;
