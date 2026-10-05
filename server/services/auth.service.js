import { User } from '../models.js';

export async function register({ username, password }) {
  const existing = await User.findOne({ username });
  if (existing) return { status: 400, body: { error: 'Username already exists' } };

  const user = new User({ username, password });
  await user.save();
  return { status: 200, body: { success: true, userId: user._id.toString(), username: user.username } };
}

export async function login({ username, password }) {
  const user = await User.findOne({ username, password });
  if (!user) return { status: 401, body: { error: 'Invalid credentials' } };

  return { status: 200, body: { success: true, userId: user._id.toString(), username: user.username } };
}
