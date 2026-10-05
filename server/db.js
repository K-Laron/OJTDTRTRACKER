import mongoose from 'mongoose';

export function connectDb(uri) {
  return mongoose.connect(uri);
}

export function isTransactionUnsupported(err) {
  if (!err) return false;
  return (
    err.code === 20
    || err.codeName === 'IllegalOperation'
    || /Transaction numbers are only allowed/i.test(err.message || '')
    || /replica set member or mongos/i.test(err.message || '')
  );
}

// ponytail: single global session helper, per-route sessions if contention shows up
export async function withOptionalTransaction(work) {
  const session = await mongoose.startSession();
  let usedTransaction = false;
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        usedTransaction = true;
        result = await work(session);
      });
      return { result, usedTransaction };
    } catch (err) {
      if (!isTransactionUnsupported(err)) throw err;
      usedTransaction = false;
      result = await work(null);
      return { result, usedTransaction };
    }
  } finally {
    await session.endSession();
  }
}
