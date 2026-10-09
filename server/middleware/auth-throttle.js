const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 8;
const SWEEP_THRESHOLD = 500;

// ponytail: process-local counter. Move to a shared store if the app is ever
// served by more than one process, otherwise the limit is per-process.
const attempts = new Map();

function attemptKey(req, username) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${String(username || '').toLowerCase()}`;
}

function sweep(now) {
  if (attempts.size < SWEEP_THRESHOLD) return;
  for (const [key, record] of attempts) {
    if (record.expiresAt <= now) attempts.delete(key);
  }
}

export function isAuthLimited(req, username) {
  const record = attempts.get(attemptKey(req, username));
  if (!record) return false;
  if (record.expiresAt <= Date.now()) {
    attempts.delete(attemptKey(req, username));
    return false;
  }
  return record.count >= ATTEMPT_LIMIT;
}

export function recordAuthFailure(req, username) {
  const key = attemptKey(req, username);
  const now = Date.now();
  sweep(now);
  const record = attempts.get(key);
  attempts.set(key, record && record.expiresAt > now
    ? { count: record.count + 1, expiresAt: record.expiresAt }
    : { count: 1, expiresAt: now + ATTEMPT_WINDOW_MS });
}

export function clearAuthFailures(req, username) {
  attempts.delete(attemptKey(req, username));
}
