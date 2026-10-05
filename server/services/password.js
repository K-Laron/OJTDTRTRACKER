import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function parseHash(stored) {
  const [algo, cost, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return null;
  const costNum = Number(cost);
  if (!Number.isInteger(costNum) || costNum <= 0) return null;
  const hashBuf = Buffer.from(hash, 'hex');
  if (!hashBuf.length) return null;
  return { cost: costNum, salt, hash: hashBuf };
}

export function isHashedPassword(stored) {
  return parseHash(stored) !== null;
}

function scryptAsync(password, salt, keyLen, params) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLen, params, (err, derived) => {
      if (err) return reject(err);
      resolve(derived);
    });
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const derived = await scryptAsync(password, parsed.salt, parsed.hash.length, {
    N: parsed.cost,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
}
