import { Router } from 'express';
import * as auth from '../services/auth.service.js';
import { clearAuthFailures, isAuthLimited, recordAuthFailure } from '../middleware/auth-throttle.js';
import { sendErrorResponse } from './errors.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = auth.validateAuthInput(req.body);
    if (isAuthLimited(req, username)) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    const result = await auth.register({ username, password });
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    sendErrorResponse(res, err, 'Registration failed', 'Registration error:');
  }
});

router.post('/login', async (req, res) => {
  try {
    // Login keeps accepting stored legacy passwords shorter than the policy.
    const { username, password } = auth.validateAuthInput(req.body, { enforcePasswordPolicy: false });
    if (isAuthLimited(req, username)) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    const result = await auth.login({ username, password });
    if (result.status === 401) {
      recordAuthFailure(req, username);
    } else {
      clearAuthFailures(req, username);
    }
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    res.json(result.body);
  } catch (err) {
    sendErrorResponse(res, err, 'Login failed', 'Login error:');
  }
});

export default router;