import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import { readAuditEvents } from '../services/audit.service.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const events = await readAuditEvents(req.userId, limit);
    res.json(events);
  } catch (err) {
    console.error('Fetch audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
