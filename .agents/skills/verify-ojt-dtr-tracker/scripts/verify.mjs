#!/usr/bin/env node
import { drive, featureNames } from './drive.mjs';
import { doctor, printDoctor, readState, startStack, stopStack } from './stack.mjs';

const HELP = `Usage: node .agents/skills/verify-ojt-dtr-tracker/scripts/verify.mjs <command>

Commands:
  launch            Start an isolated Mongo, backend, and Vite stack on ports 27019/5010/5180.
  doctor            Read-only health check of the running stack.
  run <feature>     Doctor the stack, drive one feature, and capture evidence. Starts and
                    stops its own stack when none is healthy.
  stop              Kill the recorded backend and Vite processes and remove the Mongo container.
  features          List feature IDs.

Features: ${featureNames.join(', ')}

Environment overrides:
  VERIFY_BACKEND_PORT, VERIFY_FRONTEND_PORT, VERIFY_MONGO_PORT
  VERIFY_MONGO_IMAGE (default mongo:7)
  VERIFY_MONGODB_URI (scratch database named ojt_verify_*; skips the Mongo container)`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function runFeature(feature) {
  if (!featureNames.includes(feature)) fail(`Unknown feature "${feature}".\n\n${HELP}`);

  let state = readState();
  let ownsStack = false;

  if (state) {
    const health = await doctor({ state });
    if (!health.ok) {
      console.log('Existing stack is unhealthy. Replacing it.');
      await stopStack();
      state = null;
    }
  }

  if (!state) {
    state = await startStack();
    ownsStack = true;
  }

  const health = await doctor({ state });
  if (!health.ok) {
    printDoctor(health);
    if (ownsStack) await stopStack();
    fail('Stack failed doctor before driving.');
  }

  const result = await (async () => {
    try {
      return await drive(feature, state);
    } finally {
      if (ownsStack) await stopStack();
    }
  })();

  console.log(`feature:  ${result.feature}`);
  console.log(`ok:       ${result.ok}`);
  console.log(`evidence: ${result.evidenceDir}`);
  if (result.error) console.log(`error:    ${result.error}`);
  if (result.consoleErrors.length) console.log(`console errors: ${result.consoleErrors.length}`);
  if (result.pageErrors.length) console.log(`page errors:    ${result.pageErrors.length}`);
  if (result.failedRequests.length) console.log(`failed requests: ${result.failedRequests.length}`);
  if (!result.ok) process.exit(1);
}

async function main() {
  const [command, argument] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    console.log(HELP);
    return;
  }

  if (command === 'features') {
    console.log(featureNames.join('\n'));
    return;
  }

  if (command === 'launch') {
    const state = await startStack();
    const health = await doctor({ state });
    printDoctor(health);
    if (!health.ok) {
      await stopStack();
      fail('Stack failed doctor after launch.');
    }
    console.log(`frontend: ${state.urls.frontend}`);
    console.log(`backend:  ${state.urls.backend}`);
    console.log(`state:    .runtime/verify/stack.json`);
    return;
  }

  if (command === 'doctor') {
    const result = await doctor();
    printDoctor(result);
    if (!result.ok) process.exit(1);
    return;
  }

  if (command === 'stop') {
    const result = await stopStack();
    if (!result.stopped) {
      console.log('No verification stack is running.');
      return;
    }
    console.log(`Stopped: ${result.resources.join(', ') || 'nothing was running'}`);
    return;
  }

  if (command === 'run') {
    if (!argument) fail(`run needs a feature.\n\n${HELP}`);
    await runFeature(argument);
    return;
  }

  fail(`Unknown command "${command}".\n\n${HELP}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
