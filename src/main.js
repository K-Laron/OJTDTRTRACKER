import './style.css';
import { router } from './router.js';
import { store } from './store.js';
import { ICONS, getCurrentDate, requestRender, toast } from './utils.js';

import * as dashboard from './pages/dashboard.js';
import * as timelog from './pages/timelog.js';
import * as settings from './pages/settings.js';
import * as calendar from './pages/calendar.js';
import * as login from './pages/login.js';

const app = document.getElementById('app');

const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

const navItems = [
  { path: '/', label: 'Dashboard', icon: ICONS.dashboard },
  { path: '/timelog', label: 'Time Log', icon: ICONS.clock },
  { path: '/calendar', label: 'Calendar', icon: ICON_CALENDAR },
  { path: '/dtr', label: 'DTR Sheet', icon: ICONS.document },
  { path: '/reports', label: 'Reports', icon: ICONS.chart },
  { path: '/settings', label: 'Settings', icon: ICONS.settings },
];

const routeLoaders = {
  '/': async () => dashboard,
  '/timelog': async () => timelog,
  '/calendar': async () => calendar,
  '/settings': async () => settings,
  '/dtr': () => import('./pages/dtr.js'),
  '/reports': () => import('./pages/reports.js'),
};
const routeDependencies = {
  '/': new Set(['entries', 'holidays', 'config', 'auth']),
  '/timelog': new Set(['entries', 'config', 'auth']),
  '/calendar': new Set(['entries', 'holidays', 'config', 'auth']),
  '/dtr': new Set(['entries', 'holidays', 'config', 'auth']),
  '/reports': new Set(['entries', 'holidays', 'config', 'auth']),
  '/settings': new Set(['config', 'auth']),
};
const shellDependencies = new Set(['entries', 'config', 'auth']);
const notificationDependencies = new Set(['config', 'auth']);

const pageModuleCache = new Map();
let pendingRouteRender = false;
let renderQueued = false;
let notificationSignature = '';
let renderToken = 0;
let shellBound = false;
let currentRenderedPath = '';
let currentPageModule = null;

function normalizePath(path) {
  return routeLoaders[path] ? path : '/';
}

function getActivePath() {
  return normalizePath(router.current || window.location.hash.slice(1) || '/');
}

function getPageTitle(path) {
  if (path === '/reports') return 'Loading reports';
  if (path === '/dtr') return 'Loading DTR sheet';
  return 'Loading page';
}

function hasRelevantChanges(changes, dependencies) {
  if (!changes) return true;
  if (changes.forceRender) return true;
  const resources = changes.resources || [];
  if (!resources.length) return true;
  return resources.some(resource => dependencies.has(resource));
}

function shouldRerenderRoute(path, changes) {
  if (!changes) return true;
  if (changes.forceRender) return true;
  const resources = changes.resources || [];
  if (!resources.length) return true;
  if (resources.includes('hydration') || resources.includes('auth')) return true;
  const dependencies = routeDependencies[path] || routeDependencies['/'];
  return resources.some(resource => dependencies.has(resource));
}

function renderPagePlaceholder(title, message) {
  return `
    <div class="card" style="max-width:520px">
      <div class="empty-state">
        ${ICONS.clock}
        <h4>${title}</h4>
        <p>${message}</p>
      </div>
    </div>
  `;
}

function renderLoadingState() {
  app.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; min-height:100vh;">
      ${renderPagePlaceholder('Loading records', 'Syncing your latest data from the local server.')}
    </div>
  `;
  shellBound = false;
  currentRenderedPath = '';
  currentPageModule = null;
}

function renderShell() {
  return `
    <div id="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <div class="brand-icon">${ICONS.clock}</div>
          <div class="brand-text"><h1>DTR Tracker</h1><span>OJT Time Record</span></div>
        </div>
        <nav class="sidebar-nav">
          ${navItems.map(item => `<a href="#${item.path}" class="nav-item" data-nav-path="${item.path}">${item.icon} ${item.label}</a>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <div style="font-size:0.8rem; color:var(--text-muted); padding-bottom:12px; border-bottom:1px solid var(--border); margin-bottom:12px;">
            Logged in as <b id="sidebar-username" style="color:var(--text)"></b>
            <a href="#" id="btn-logout" style="color:var(--primary); text-decoration:none; float:right;">Logout</a>
          </div>
          <button class="theme-toggle" id="theme-toggle"></button>
          <div class="progress-mini" style="margin-top:12px">
            <div class="progress-mini-bar" id="sidebar-progress-bar"></div>
          </div>
          <span class="progress-mini-text" id="sidebar-progress-text"></span>
        </div>
      </aside>
      <main class="main-content">
        <div class="page-content" id="page-content"></div>
      </main>
    </div>
  `;
}

function ensureShell() {
  if (document.getElementById('app-shell')) return;
  app.innerHTML = renderShell();
  shellBound = false;
  bindShellEvents();
}

function bindShellEvents() {
  if (shellBound) return;
  document.getElementById('theme-toggle')?.addEventListener('click', async () => {
    try {
      await store.setTheme(store.state.theme === 'dark' ? 'light' : 'dark');
    } catch (err) {
      toast(err.message || 'Failed to update theme', 'error');
    }
  });

  document.getElementById('btn-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    store.logout();
  });

  shellBound = true;
}

function updateShellChrome(activePath) {
  const progress = store.getProgress();
  const theme = store.state.theme;

  document.querySelectorAll('[data-nav-path]').forEach(el => {
    el.classList.toggle('active', el.dataset.navPath === activePath);
  });

  const usernameEl = document.getElementById('sidebar-username');
  if (usernameEl) usernameEl.textContent = store.username || '';

  const themeToggleEl = document.getElementById('theme-toggle');
  if (themeToggleEl) {
    themeToggleEl.innerHTML = `${theme === 'dark' ? ICON_SUN : ICON_MOON} ${theme === 'dark' ? 'Light Mode' : 'Dark Mode'}`;
  }

  const progressBarEl = document.getElementById('sidebar-progress-bar');
  if (progressBarEl) progressBarEl.style.width = `${progress}%`;

  const progressTextEl = document.getElementById('sidebar-progress-text');
  if (progressTextEl) {
    progressTextEl.textContent = `${progress.toFixed(1)}% Complete - ${store.getTotalHours().toFixed(1)}h / ${store.getRequiredHours()}h`;
  }
}

function getPageContentElement() {
  return document.getElementById('page-content');
}

async function loadPageModule(path) {
  const normalizedPath = normalizePath(path);
  if (!pageModuleCache.has(normalizedPath)) {
    pageModuleCache.set(normalizedPath, await routeLoaders[normalizedPath]());
  }
  return pageModuleCache.get(normalizedPath);
}

async function renderPage(path) {
  const normalizedPath = normalizePath(path);
  const token = ++renderToken;

  if (!store.userId) {
    app.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; min-height:100vh;">${login.render()}</div>`;
    if (login.mount) login.mount();
    shellBound = false;
    currentRenderedPath = '';
    currentPageModule = null;
    return;
  }

  if (store.isHydrating) {
    renderLoadingState();
    return;
  }

  ensureShell();
  bindShellEvents();
  updateShellChrome(normalizedPath);

  const pageContentEl = getPageContentElement();
  if (!pageContentEl) return;

  if (!pageModuleCache.has(normalizedPath)) {
    pageContentEl.innerHTML = renderPagePlaceholder(getPageTitle(normalizedPath), 'Preparing the page module and data.');
  }

  let pageModule;
  try {
    pageModule = await loadPageModule(normalizedPath);
  } catch (err) {
    if (token !== renderToken) return;
    pageContentEl.innerHTML = renderPagePlaceholder('Page failed to load', err.message || 'Please try again.');
    return;
  }

  if (token !== renderToken || normalizedPath !== getActivePath()) return;

  updateShellChrome(normalizedPath);
  if (currentRenderedPath === normalizedPath && currentPageModule === pageModule && typeof pageModule.update === 'function') {
    pageModule.update(pageContentEl);
    return;
  }

  pageContentEl.innerHTML = pageModule.render();
  if (pageModule.mount) pageModule.mount(pageContentEl);
  currentRenderedPath = normalizedPath;
  currentPageModule = pageModule;
}

function scheduleActiveRouteRender() {
  if (document.querySelector('.modal-overlay')) {
    pendingRouteRender = true;
    return;
  }
  pendingRouteRender = false;
  void renderPage(getActivePath());
}

function queueActiveRouteRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    scheduleActiveRouteRender();
  });
}

Object.keys(routeLoaders).forEach(path => {
  router.on(path, () => {
    void renderPage(path);
  });
});

if (store.state.theme === 'light') document.body.className = 'light-theme';

document.addEventListener('keydown', async e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.matches('input, textarea, select')) {
    e.preventDefault();
    if (await store.undo()) {
      toast('Undone!', 'info');
      requestRender();
    }
  }
});

function checkAutoBackup() {
  const { autoBackup, lastBackupDate } = store.state.settings;
  if (autoBackup === 'off') return;
  const now = Date.now();
  const last = lastBackupDate ? new Date(lastBackupDate).getTime() : 0;
  const interval = autoBackup === 'weekly' ? 7 * 86400000 : 30 * 86400000;
  if (now - last > interval) {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ojt-dtr-backup-${getCurrentDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    store.updateSettings({ lastBackupDate: new Date().toISOString() }).catch(err => {
      console.error('Failed to update backup timestamp:', err);
    });
    toast('Auto-backup downloaded!', 'info');
  }
}
checkAutoBackup();

let notifInterval = null;
function setupNotifications() {
  const s = store.state.settings;
  const nextSignature = JSON.stringify({
    enabled: s.notificationsEnabled,
    clockInReminder: s.clockInReminder,
    clockOutReminder: s.clockOutReminder,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  });

  if (nextSignature === notificationSignature) return;
  notificationSignature = nextSignature;

  if (notifInterval) {
    clearInterval(notifInterval);
    notifInterval = null;
  }

  if (!s.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

  const shown = new Set();
  notifInterval = setInterval(() => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = getCurrentDate();

    if (timeStr === s.clockInReminder && !shown.has('in-' + today)) {
      const { phase } = store.getClockPhase(today);
      if (phase === 0) {
        new Notification('DTR Tracker', { body: 'Time to clock in.', icon: '/favicon.svg' });
        shown.add('in-' + today);
      }
    }
    if (timeStr === s.clockOutReminder && !shown.has('out-' + today)) {
      const { phase } = store.getClockPhase(today);
      if (phase > 0 && phase < 4) {
        new Notification('DTR Tracker', { body: 'Time to clock out.', icon: '/favicon.svg' });
        shown.add('out-' + today);
      }
    }
  }, 30000);
}
setupNotifications();
store.subscribe((state, changes) => {
  if (hasRelevantChanges(changes, notificationDependencies)) {
    setupNotifications();
  }
});
store.subscribe((state, changes) => {
  const activePath = getActivePath();
  if (store.userId && !store.isHydrating && document.getElementById('app-shell') && hasRelevantChanges(changes, shellDependencies)) {
    updateShellChrome(activePath);
  }
  if (shouldRerenderRoute(activePath, changes)) {
    queueActiveRouteRender();
  }
});
document.addEventListener('app:rerender', () => queueActiveRouteRender());
document.addEventListener('modal-closed', () => {
  if (!pendingRouteRender) return;
  pendingRouteRender = false;
  queueActiveRouteRender();
});

document.addEventListener('render-auth', () => {
  if (!store.userId) void renderPage(getActivePath());
});

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

router.resolve();
