import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTransitionOrigin, animateThemeTransition, switchThemeWithTransition } from './theme-transition.js';

test('calculateTransitionOrigin uses mouse coordinates when available', () => {
  const origin = calculateTransitionOrigin({ clientX: 200, clientY: 150 }, { width: 1000, height: 800 });
  assert.equal(origin.x, 200);
  assert.equal(origin.y, 150);
  const expectedRadius = Math.ceil(Math.hypot(800, 650));
  assert.equal(origin.endRadius, expectedRadius);
});

test('calculateTransitionOrigin uses element bounding rect for keyboard activations', () => {
  const mockElement = {
    getBoundingClientRect: () => ({ left: 40, top: 60, width: 120, height: 40 }),
  };
  const event = { clientX: 0, clientY: 0, currentTarget: mockElement };
  const origin = calculateTransitionOrigin(event, { width: 1000, height: 800 });
  assert.equal(origin.x, 100);
  assert.equal(origin.y, 80);
});

test('calculateTransitionOrigin falls back to viewport center when trigger is null', () => {
  const origin = calculateTransitionOrigin(null, { width: 1200, height: 900 });
  assert.equal(origin.x, 600);
  assert.equal(origin.y, 450);
  const expectedRadius = Math.ceil(Math.hypot(600, 450));
  assert.equal(origin.endRadius, expectedRadius);
});

test('animateThemeTransition runs update callback directly in Node environment', async () => {
  let executed = false;
  await animateThemeTransition(() => {
    executed = true;
  }, null);
  assert.equal(executed, true);
});

test('switchThemeWithTransition updates theme state and notifies dom callback', async () => {
  const mockStore = {
    state: { theme: 'dark' },
    async setTheme(t) {
      this.state.theme = t;
    },
  };

  let notifiedTheme = null;
  await switchThemeWithTransition(mockStore, 'light', { clientX: 50, clientY: 50 }, (theme) => {
    notifiedTheme = theme;
  });

  assert.equal(mockStore.state.theme, 'light');
  assert.equal(notifiedTheme, 'light');
});

test('switchThemeWithTransition reverts theme state if setTheme fails', async () => {
  const mockStore = {
    state: { theme: 'dark' },
    async setTheme() {
      throw new Error('Save failed');
    },
  };

  let lastNotifiedTheme = null;
  await assert.rejects(
    () => switchThemeWithTransition(mockStore, 'light', null, (t) => { lastNotifiedTheme = t; }),
    { message: 'Save failed' }
  );

  assert.equal(mockStore.state.theme, 'dark');
  assert.equal(lastNotifiedTheme, 'dark');
});

test('switchThemeWithTransition ignores no-op when theme is already active', async () => {
  let called = false;
  const mockStore = {
    state: { theme: 'dark' },
    async setTheme() { called = true; },
  };

  await switchThemeWithTransition(mockStore, 'dark', null);
  assert.equal(called, false);
});
