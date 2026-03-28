import { Hono } from 'hono';

const router = new Hono();

router.get('/', (c) => {
	return c.json({ ok: true, timestamp: Date.now() });
});

export default router;
