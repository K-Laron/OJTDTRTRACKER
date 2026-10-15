import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import { readAuditEvents } from '../services/audit.service.js';
import { sendErrorResponse } from './errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const events = await readAuditEvents(req.userId, limit);
    res.json(events);
  } catch (err) {
    sendErrorResponse(res, err, 'Failed to fetch audit log', 'Fetch audit log error:');
  }
});

export default router;
