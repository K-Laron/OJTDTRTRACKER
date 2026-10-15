import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import * as holidays from '../services/holiday.service.js';
import { sendErrorResponse } from './errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    res.json(await holidays.listHolidays(req.userId, req.query));
  } catch (err) {
    sendErrorResponse(res, err, 'Failed to fetch holidays', 'Fetch holidays error:');
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
    sendErrorResponse(res, err, 'Failed to add holiday', 'Add holiday error:');
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
    sendErrorResponse(res, err, 'Failed to update holiday', 'Update holiday error:');
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
    sendErrorResponse(res, err, 'Failed to delete holiday', 'Delete holiday error:');
  }
});

export default router;
