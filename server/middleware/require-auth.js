import { User } from '../models.js';
import { verifyAuthToken } from '../services/auth-token.js';

export const AUTH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function isAuthTokenExpired(createdAt, now = Date.now(), ttlMs = AUTH_TOKEN_TTL_MS) {
  if (!createdAt) return false;
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return false;
  return (now - createdTime) > ttlMs;
}

// A userId header alone identifies a user to anyone who knows or guesses the
// id. Require the session token issued at login as well.
export async function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  const authToken = req.headers['x-auth-token'];
  if (!userId || !authToken) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await User.findById(userId).lean();
    if (!user?.authTokenHash || !verifyAuthToken(user.authTokenHash, authToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (isAuthTokenExpired(user.authTokenCreatedAt)) {
      return res.status(401).json({ error: 'Session expired' });
    }
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
