import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptDir, '../../../..');
export const runtimeDir = path.join(repoRoot, '.runtime', 'verify');
export const statePath = path.join(runtimeDir, 'stack.json');
export const evidenceRoot = path.join(repoRoot, 'output', 'verification');
export const mongodImage = process.env.VERIFY_MONGO_IMAGE || 'mongo:7';

export function readPorts() {
  return {
    backend: Number(process.env.VERIFY_BACKEND_PORT || 5010),
    frontend: Number(process.env.VERIFY_FRONTEND_PORT || 5180),
    mongo: Number(process.env.VERIFY_MONGO_PORT || 27019),
  };
}

export function stackUrls(ports) {
  return {
    frontend: `http://127.0.0.1:${ports.frontend}`,
    backend: `http://127.0.0.1:${ports.backend}`,
    mongo: `mongodb://127.0.0.1:${ports.mongo}`,
  };
}
