import { User } from '../models.js';
import { hashPassword, isHashedPassword, verifyPassword } from './password.js';

export async function register({ username, password }) {
  const existing = await User.findOne({ username });
  if (existing) return { status: 400, body: { error: 'Username already exists' } };

  const user = new User({ username, password: await hashPassword(password) });
  await user.save();
  return { status: 200, body: { success: true, userId: user._id.toString(), username: user.username } };
}

export async function login({ username, password }) {
  const user = await User.findOne({ username });
  if (!user) return { status: 401, body: { error: 'Invalid credentials' } };

  let verified;
  if (isHashedPassword(user.password)) {
    verified = await verifyPassword(password, user.password);
  } else {
    // Legacy plain-text password: upgrade to a hash on successful login.
    verified = user.password === password;
    if (verified) {
      user.password = await hashPassword(password);
      await user.save();
    }
  }
  if (!verified) return { status: 401, body: { error: 'Invalid credentials' } };

  return { status: 200, body: { success: true, userId: user._id.toString(), username: user.username } };
}
