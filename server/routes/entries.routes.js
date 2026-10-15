import { Router } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import * as entries from '../services/entry.service.js';
import { sendErrorResponse } from './errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : '';
    const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : '';
    const page = Number.parseInt(req.query.page, 10);
    const limit = Number.parseInt(req.query.limit, 10);
    res.json(await entries.listEntries(req.userId, { dateFrom, dateTo, page, limit }));
  } catch (err) {
    sendErrorResponse(res, err, 'Failed to fetch entries', 'Fetch entries error:');
  }
});

router.post('/', async (req, res) => {
  try {
    res.json(await entries.createEntry(req.userId, req.body));
  } catch (err) {
    sendErrorResponse(res, err, 'Failed to add entry', 'Add entry error:');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await entries.updateEntry(req.userId, req.params.id, req.body || {});
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    sendErrorResponse(res, err, 'Failed to update entry', 'Update entry error:');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await entries.deleteEntry(req.userId, req.params.id, req.body);
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    sendErrorResponse(res, err, 'Failed to delete entry', 'Delete entry error:');
  }
});

export default router;
