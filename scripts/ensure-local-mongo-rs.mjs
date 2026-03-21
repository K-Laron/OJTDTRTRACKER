import mongoose from 'mongoose';

const uri = process.env.MONGO_ADMIN_URI || 'mongodb://127.0.0.1:27017/admin?directConnection=true';
const replicaSetName = process.env.MONGO_RS_NAME || 'rs0';
const memberHost = process.env.MONGO_RS_HOST || '127.0.0.1:27017';
const timeoutMs = Number(process.env.MONGO_RS_TIMEOUT_MS || 30000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connect() {
  return mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    directConnection: true,
  }).asPromise();
}

async function getHello(adminDb) {
  try {
    return await adminDb.command({ hello: 1 });
  } catch {
    return adminDb.command({ isMaster: 1 });
  }
}

async function ensureReplicaSet() {
  const conn = await connect();
  try {
    const adminDb = conn.db.admin();
    const hello = await getHello(adminDb);

    if (hello.setName === replicaSetName && (hello.isWritablePrimary || hello.ismaster)) {
      console.log(`Replica set ${replicaSetName} is already initialized and writable.`);
      return;
    }

    if (hello.setName && hello.setName !== replicaSetName) {
      throw new Error(`MongoDB is already configured as replica set ${hello.setName}, expected ${replicaSetName}.`);
    }

    if (!hello.setName) {
      try {
        await adminDb.command({
          replSetInitiate: {
            _id: replicaSetName,
            members: [{ _id: 0, host: memberHost }],
          },
        });
        console.log(`Initiated replica set ${replicaSetName}.`);
      } catch (err) {
        if (!/already initialized/i.test(err.message || '')) {
          throw err;
        }
      }
    }

    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
      const nextHello = await getHello(adminDb);
      if (nextHello.setName === replicaSetName && (nextHello.isWritablePrimary || nextHello.ismaster)) {
        console.log(`Replica set ${replicaSetName} is writable.`);
        return;
      }
      await sleep(1000);
    }

    throw new Error(`Replica set ${replicaSetName} did not become writable within ${timeoutMs}ms.`);
  } finally {
    await conn.close();
  }
}

ensureReplicaSet().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
