import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  evidenceRoot,
  mongodImage,
  readPorts,
  repoRoot,
  runtimeDir,
  stackUrls,
  statePath,
} from './config.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processMatches(pid, marker) {
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`).startsWith(marker);
  } catch {
    return true;
  }
}

function portInUse(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitFor(check, { timeout = 90000, interval = 500, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (err) {
      if (err.fatal) throw err;
      lastError = err;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

function readLog(logFile) {
  try {
    const text = fs.readFileSync(logFile, 'utf8');
    return text.slice(-8000);
  } catch {
    return '';
  }
}

function startProcess({ name, args, env, logFile }) {
  const fd = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', fd, fd],
    detached: true,
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(fd);
  if (!child.pid) throw new Error(`${name} failed to start`);
  return child.pid;
}

function startMongoContainer(ports, runId) {
  const containerName = `ojt-verify-${runId}`;
  const result = spawnSync(
    'docker',
    ['run', '-d', '--rm', '--name', containerName, '-p', `127.0.0.1:${ports.mongo}:27017`, mongodImage, '--quiet'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `docker run failed: ${(result.stderr || result.stdout || '').trim()}. `
      + 'Install Docker, or set VERIFY_MONGODB_URI to a scratch database named ojt_verify_*.',
    );
  }
  return containerName;
}

function resolveMongoUri(ports, runId) {
  const configured = String(process.env.VERIFY_MONGODB_URI || '').trim();
  if (!configured) {
    return {
      containerName: startMongoContainer(ports, runId),
      uri: `mongodb://127.0.0.1:${ports.mongo}/ojt_verify_${runId}`,
    };
  }
  if (!/\/ojt_verify_[a-z0-9_]+\b/.test(configured)) {
    throw new Error(
      'VERIFY_MONGODB_URI must point at a scratch database whose name starts with ojt_verify_. '
      + 'Refusing to drive the real tracker database.',
    );
  }
  return { containerName: null, uri: configured };
}

async function registerAccount(urls, account) {
  const headers = { 'content-type': 'application/json', origin: urls.frontend };
  const body = JSON.stringify(account);

  await waitFor(async () => {
    const res = await fetch(`${urls.backend}/api/auth/register`, { method: 'POST', headers, body });
    if (res.status === 200) return true;
    if (res.status === 400) {
      const login = await fetch(`${urls.backend}/api/auth/login`, { method: 'POST', headers, body });
      return login.status === 200;
    }
    throw new Error(`register returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }, { timeout: 30000, label: 'scratch account' });
}

export async function startStack() {
  const existing = readState();
  if (existing) {
    if (existing.processes?.every(proc => isAlive(proc.pid))) {
      return { ...existing, reused: true };
    }
    await stopStack();
  }

  const ports = readPorts();
  const urls = stackUrls(ports);

  for (const [name, port] of Object.entries(ports)) {
    if (await portInUse(port)) {
      throw new Error(`Port ${port} (${name}) is already in use. Stop the process that owns it, or set VERIFY_${name.toUpperCase()}_PORT.`);
    }
  }

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();
  const logs = {
    backend: path.join(runtimeDir, 'backend.log'),
    vite: path.join(runtimeDir, 'vite.log'),
  };
  fs.writeFileSync(logs.backend, '');
  fs.writeFileSync(logs.vite, '');

  const processes = [];
  let containerName = null;
  let mongoUri = null;

  try {
    ({ containerName, uri: mongoUri } = resolveMongoUri(ports, runId));

    if (containerName) {
      await waitFor(() => portInUse(ports.mongo), { label: 'MongoDB port' });
    }

    const backendPid = startProcess({
      name: 'backend',
      args: ['server/server.js'],
      env: {
        PORT: String(ports.backend),
        MONGODB_URI: mongoUri,
        CORS_ORIGINS: urls.frontend,
      },
      logFile: logs.backend,
    });
    processes.push({ name: 'backend', pid: backendPid, logFile: logs.backend });

    await waitFor(() => {
      const log = readLog(logs.backend);
      if (/MongoDB connection error/.test(log)) {
        const err = new Error(`backend could not reach MongoDB (${mongoUri})`);
        err.fatal = true;
        throw err;
      }
      return /Server running on port/.test(log) && /Connected to MongoDB/.test(log);
    }, { label: 'backend readiness' });

    const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(viteBin)) throw new Error('Vite is not installed. Run npm ci first.');

    const vitePid = startProcess({
      name: 'vite',
      args: [viteBin, '--port', String(ports.frontend), '--strictPort', '--host', '127.0.0.1'],
      env: { API_PROXY_TARGET: urls.backend },
      logFile: logs.vite,
    });
    processes.push({ name: 'vite', pid: vitePid, logFile: logs.vite });

    await waitFor(async () => {
      const res = await fetch(`${urls.frontend}/`);
      return res.ok;
    }, { label: 'Vite dev server' });

    const account = { username: `verify_${runId}`, password: `verify-pass-${runId}` };
    await registerAccount(urls, account);

    const state = {
      runId,
      startedAt,
      ports,
      urls,
      containerName,
      mongoUri,
      processes,
      account,
      logFiles: logs,
    };
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  } catch (err) {
    for (const proc of processes.reverse()) {
      try { process.kill(proc.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    if (containerName) spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8' });
    throw err;
  }
}

async function stopPid(proc) {
  if (!isAlive(proc.pid)) return false;
  if (!processMatches(proc.pid, repoRoot)) {
    throw new Error(`PID ${proc.pid} (${proc.name}) no longer belongs to this checkout. Refusing to kill it.`);
  }
  try { process.kill(proc.pid, 'SIGTERM'); } catch { return false; }
  for (let i = 0; i < 20; i += 1) {
    if (!isAlive(proc.pid)) return true;
    await sleep(150);
  }
  try { process.kill(proc.pid, 'SIGKILL'); } catch { /* already gone */ }
  return true;
}

export async function stopStack() {
  const state = readState();
  if (!state) return { stopped: false, reason: 'no stack state' };

  const stopped = [];
  for (const proc of [...(state.processes || [])].reverse()) {
    if (await stopPid(proc)) stopped.push(proc.name);
  }

  if (state.containerName) {
    const result = spawnSync('docker', ['rm', '-f', state.containerName], { encoding: 'utf8' });
    if (result.status === 0) stopped.push(`container ${state.containerName}`);
  }

  fs.rmSync(statePath, { force: true });
  return { stopped: true, resources: stopped };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (err) {
    return { name, ok: false, detail: err.message };
  }
}

export async function doctor({ state = readState() } = {}) {
  const checks = [];
  checks.push(await check('stack state', () => {
    if (!state) throw new Error(`missing ${statePath}; run launch first`);
    return state.runId;
  }));

  if (!state) return { ok: false, checks };

  checks.push(await check('processes alive', () => {
    const dead = (state.processes || []).filter(proc => !isAlive(proc.pid));
    if (dead.length) throw new Error(`not running: ${dead.map(proc => `${proc.name}:${proc.pid}`).join(', ')}`);
    return state.processes.map(proc => proc.name).join(', ');
  }));

  checks.push(await check('backend contract', async () => {
    const res = await fetch(`${state.urls.backend}/api/unknown`, {
      headers: { origin: state.urls.frontend },
    });
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    if (res.headers.get('x-content-type-options') !== 'nosniff') throw new Error('missing security headers');
    return '404 with security headers';
  }));

  checks.push(await check('vite app shell', async () => {
    const res = await fetch(`${state.urls.frontend}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('id="app"')) throw new Error('app shell missing');
    return 'app shell served';
  }));

  checks.push(await check('vite api proxy', async () => {
    const res = await fetch(`${state.urls.frontend}/api/unknown`, {
      headers: { origin: state.urls.frontend },
    });
    if (res.status !== 404) throw new Error(`proxy returned ${res.status}`);
    return 'proxy reaches backend';
  }));

  checks.push(await check('scratch login', async () => {
    const res = await fetch(`${state.urls.backend}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: state.urls.frontend },
      body: JSON.stringify(state.account),
    });
    if (!res.ok) throw new Error(`login returned ${res.status}`);
    const body = await res.json();
    if (!body.authToken) throw new Error('login response has no session token');
    return `user ${body.username}`;
  }));

  return { ok: checks.every(item => item.ok), checks };
}

export function printDoctor(result) {
  for (const item of result.checks) {
    console.log(`${item.ok ? 'ok  ' : 'FAIL'} ${item.name}${item.detail ? `: ${item.detail}` : ''}`);
  }
}
