import { Router } from 'express';
import { User } from '../models.js';
import { verifyAuthToken } from '../services/auth-token.js';
import { addSyncClient } from '../sync-hub.js';

const router = Router();

// EventSource cannot send headers, so the session token arrives as a query
// parameter. It is therefore visible in access logs and browser history;
// the alternative is a fetch-based SSE reader.
router.get('/', async (req, res, next) => {
  const { userId, authToken } = req.query;
  try {
    const user = userId && authToken ? await User.findById(userId).lean() : null;
    if (!user?.authTokenHash || !verifyAuthToken(user.authTokenHash, authToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.on('close', addSyncClient(userId, res));
  } catch (err) {
    next(err);
  }
});

export default router;
