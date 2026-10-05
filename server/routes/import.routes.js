import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import * as imports from '../services/import.service.js';
import { isTransactionUnsupported } from '../db.js';

const router = Router();
router.use(requireAuth);

router.post('/preview', async (req, res) => {
  try {
    const result = await imports.previewImport(req.userId, req.body || {});
    res.json(result.body);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid import payload' });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await imports.applyImport(req.userId, req.body || {});
    res.json(result.body);
  } catch (err) {
    console.error('Import error:', err);
    if (isTransactionUnsupported(err)) {
      return res.status(500).json({ error: 'Mongo transactions are not available in this MongoDB setup. The app can still run, but bulk import atomicity is limited.' });
    }
    res.status(400).json({ error: 'Failed to import data: ' + err.message });
  }
});

export default router;
