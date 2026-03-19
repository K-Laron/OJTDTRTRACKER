import './style.css';
import { router } from './router.js';
import { store } from './store.js';
import { ICONS, toast } from './utils.js';

import * as dashboard from './pages/dashboard.js';
import * as timelog from './pages/timelog.js';
import * as dtr from './pages/dtr.js';
import * as reports from './pages/reports.js';
import * as settings from './pages/settings.js';
import * as calendar from './pages/calendar.js';
import * as login from './pages/login.js';

const app = document.getElementById('app');

const pages = {
  '/': dashboard,
  '/timelog': timelog,
  '/calendar': calendar,
  '/dtr': dtr,
  '/reports': reports,
  '/settings': settings,
};

const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';

const navItems = [
  { path: '/', label: 'Dashboard', icon: ICONS.dashboard },
  { path: '/timelog', label: 'Time Log', icon: ICONS.clock },
  { path: '/calendar', label: 'Calendar', icon: ICON_CALENDAR },
  { path: '/dtr', label: 'DTR Sheet', icon: ICONS.document },
  { path: '/reports', label: 'Reports', icon: ICONS.chart },
  { path: '/settings', label: 'Settings', icon: ICONS.settings },
];

function renderLayout(content, activePath) {
  const progress = store.getProgress();
  const theme = store.state.theme;

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="brand-icon">${ICONS.clock}</div>
        <div class="brand-text"><h1>DTR Tracker</h1><span>OJT Time Record</span></div>
      </div>
      <nav class="sidebar-nav">
        ${navItems.map(n => `<a href="#${n.path}" class="nav-item ${activePath === n.path ? 'active' : ''}">${n.icon} ${n.label}</a>`).join('')}
      </nav>
      <div class="sidebar-footer">
        <div style="font-size:0.8rem; color:var(--text-muted); padding-bottom:12px; border-bottom:1px solid var(--border); margin-bottom:12px;">
          Logged in as <b style="color:var(--text)">${store.username}</b>
          <a href="#" id="btn-logout" style="color:var(--primary); text-decoration:none; float:right;">Logout</a>
        </div>
        <button class="theme-toggle" id="theme-toggle">
          ${theme === 'dark' ? ICON_SUN : ICON_MOON}
          ${theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <div class="progress-mini" style="margin-top:12px">
          <div class="progress-mini-bar" style="width:${progress}%"></div>
        </div>
        <span class="progress-mini-text">${progress.toFixed(1)}% Complete · ${store.getTotalHours().toFixed(1)}h / ${store.getRequiredHours()}h</span>
      </div>
    </aside>
    <main class="main-content">
      <div class="page-content">${content}</div>
    </main>
  `;
}

function renderPage(path) {
  if (!store.userId) {
    app.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; min-height:100vh;">${login.render()}</div>`;
    if (login.mount) login.mount();
    return;
  }

  const page = pages[path] || pages['/'];
  const content = page.render();
  app.innerHTML = renderLayout(content, path);
  if (page.mount) page.mount();

  // Theme toggle in sidebar
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    store.setTheme(store.state.theme === 'dark' ? 'light' : 'dark');
    window.dispatchEvent(new Event('hashchange'));
  });

  // Logout button
  document.getElementById('btn-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    store.logout();
  });
}

// Register routes
Object.keys(pages).forEach(path => {
  router.on(path, () => renderPage(path));
});

// --- INIT: Theme ---
if (store.state.theme === 'light') document.body.className = 'light-theme';

// --- INIT: Undo (Ctrl+Z) ---
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.matches('input, textarea, select')) {
    e.preventDefault();
    if (store.undo()) {
      toast('Undone!', 'info');
      window.dispatchEvent(new Event('hashchange'));
    }
  }
});

// --- INIT: Auto-backup ---
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
    a.download = `ojt-dtr-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    store.updateSettings({ lastBackupDate: new Date().toISOString() });
    toast('Auto-backup downloaded!', 'info');
  }
}
checkAutoBackup();

// --- INIT: Notifications ---
let notifInterval = null;
function setupNotifications() {
  if (notifInterval) clearInterval(notifInterval);
  const s = store.state.settings;
  if (!s.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

  const shown = new Set();
  notifInterval = setInterval(() => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];

    if (timeStr === s.clockInReminder && !shown.has('in-' + today)) {
      const { phase } = store.getClockPhase(today);
      if (phase === 0) {
        new Notification('DTR Tracker', { body: "Time to clock in! ☀️", icon: '/favicon.svg' });
        shown.add('in-' + today);
      }
    }
    if (timeStr === s.clockOutReminder && !shown.has('out-' + today)) {
      const { phase } = store.getClockPhase(today);
      if (phase > 0 && phase < 4) {
        new Notification('DTR Tracker', { body: "Time to clock out! 🌙", icon: '/favicon.svg' });
        shown.add('out-' + today);
      }
    }
  }, 30000);
}
setupNotifications();
store.subscribe(() => setupNotifications());

// --- INIT: PWA ---
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// --- INIT: Auth Re-render ---
document.addEventListener('render-auth', () => {
  if (!store.userId) renderPage(window.location.hash.slice(1) || '/');
});

// Start router
router.resolve();
