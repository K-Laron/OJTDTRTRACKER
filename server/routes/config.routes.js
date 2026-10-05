import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import * as config from '../services/config.service.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    res.json(await config.getConfig(req.userId));
  } catch (err) {
    console.error('Fetch config error:', err);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

router.put('/', async (req, res) => {
  try {
    const result = await config.updateConfig(req.userId, req.body);
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    console.error('Update config error:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

export default router;
