import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import * as config from '../services/config.service.js';
import { sendErrorResponse } from './errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    res.json(await config.getConfig(req.userId));
  } catch (err) {
    sendErrorResponse(res, err, 'Failed to fetch config', 'Fetch config error:');
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
    sendErrorResponse(res, err, 'Failed to update config', 'Update config error:');
  }
});

export default router;
