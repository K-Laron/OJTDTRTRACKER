import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import * as holidays from '../services/holiday.service.js';
import { getErrorStatus } from './errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    res.json(await holidays.listHolidays(req.userId, req.query));
  } catch (err) {
    console.error('Fetch holidays error:', err);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await holidays.createHoliday(req.userId, req.body || {});
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    console.error('Add holiday error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to add holiday' });
  }
});

router.put('/:date', async (req, res) => {
  try {
    const result = await holidays.updateHoliday(req.userId, req.params.date, req.body);
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    console.error('Update holiday error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to update holiday' });
  }
});

router.delete('/:date', async (req, res) => {
  try {
    const result = await holidays.deleteHoliday(req.userId, req.params.date);
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    console.error('Delete holiday error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to delete holiday' });
  }
});

export default router;
