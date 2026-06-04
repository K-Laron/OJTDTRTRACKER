import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_HASH_VERSION = '1';
const PASSWORD_KEY_LENGTH = 64;

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateAuthInput({ username, password } = {}, { enforcePasswordPolicy = true } = {}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = String(password || '');

  if (!normalizedUsername || !normalizedPassword) {
    throw new Error('Username and password are required');
  }
  if (normalizedUsername.length < 3 || normalizedUsername.length > 64) {
    throw new Error('Username must be 3 to 64 characters');
  }
  if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
    throw new Error('Username can only use letters, numbers, dot, underscore, and hyphen');
  }
  if (enforcePasswordPolicy && (normalizedPassword.length < 8 || normalizedPassword.length > 128)) {
    throw new Error('Password must be 8 to 128 characters');
  }
  if (!enforcePasswordPolicy && normalizedPassword.length > 128) {
    throw new Error('Password must be 128 characters or fewer');
  }

  return {
    username: normalizedUsername,
    password: normalizedPassword,
  };
}

export function isPasswordHash(value) {
  return String(value || '').startsWith(`${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_VERSION}$`);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const key = await scryptAsync(String(password), salt, PASSWORD_KEY_LENGTH);
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_VERSION}$${salt}$${Buffer.from(key).toString('base64url')}`;
}

export async function verifyPassword(password, storedPassword) {
  if (!isPasswordHash(storedPassword)) {
    const actual = Buffer.from(String(password));
    const expected = Buffer.from(String(storedPassword || ''));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  const [, , salt, expectedHash] = String(storedPassword).split('$');
  const expected = Buffer.from(expectedHash || '', 'base64url');
  const actual = await scryptAsync(String(password), salt, expected.length);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function createAuthToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashAuthToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url');
}
