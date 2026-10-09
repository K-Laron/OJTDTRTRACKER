import { User } from '../models.js';
import { createAuthToken, hashAuthToken } from './auth-token.js';
import { hashPassword, isHashedPassword, verifyPassword } from './password.js';

const USERNAME_RE = /^[a-z0-9._-]+$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateAuthInput({ username, password } = {}, { enforcePasswordPolicy = true } = {}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = String(password || '');

  if (!normalizedUsername || !normalizedPassword) {
    throw new Error('Username and password are required');
  }
  if (normalizedUsername.length < MIN_USERNAME_LENGTH || normalizedUsername.length > MAX_USERNAME_LENGTH) {
    throw new Error(`Username must be ${MIN_USERNAME_LENGTH} to ${MAX_USERNAME_LENGTH} characters`);
  }
  if (!USERNAME_RE.test(normalizedUsername)) {
    throw new Error('Username can only use letters, numbers, dot, underscore, and hyphen');
  }
  // Login keeps accepting stored legacy passwords that predate the policy.
  if (normalizedPassword.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`);
  }
  if (enforcePasswordPolicy && normalizedPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`);
  }

  return { username: normalizedUsername, password: normalizedPassword };
}

async function issueAuthResponse(user) {
  const authToken = createAuthToken();
  user.authTokenHash = hashAuthToken(authToken);
  user.authTokenCreatedAt = new Date();
  await user.save();
  return {
    success: true,
    userId: user._id.toString(),
    username: user.username,
    authToken,
  };
}

export async function register({ username, password }) {
  const existing = await User.findOne({ username });
  if (existing) return { status: 400, body: { error: 'Username already exists' } };

  const user = new User({ username, password: await hashPassword(password) });
  return { status: 200, body: await issueAuthResponse(user) };
}

export async function login({ username, password }) {
  const user = await User.findOne({ username });
  if (!user) return { status: 401, body: { error: 'Invalid credentials' } };

  let verified = false;
  let needsUpgrade = false;
  if (isHashedPassword(user.password)) {
    verified = await verifyPassword(password, user.password);
    if (!verified && user.password === password) {
      // Legacy plain-text row shaped like a hash string.
      verified = true;
      needsUpgrade = true;
    }
  } else {
    // Legacy plain-text password: upgrade to a hash on successful login.
    verified = user.password === password;
    needsUpgrade = verified;
  }
  if (needsUpgrade) {
    user.password = await hashPassword(password);
  }
  if (!verified) return { status: 401, body: { error: 'Invalid credentials' } };

  return { status: 200, body: await issueAuthResponse(user) };
}