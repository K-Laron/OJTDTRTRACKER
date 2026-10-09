import { User } from '../models.js';
import { verifyAuthToken } from '../services/auth-token.js';

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
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
