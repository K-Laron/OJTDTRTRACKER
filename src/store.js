const DEFAULT_STATE = {
  profile: {
    name: '', department: '', school: '', supervisor: '',
    position: 'OJT Trainee', startDate: '',
  },
  settings: {
    requiredHours: 486,
    breakDuration: 60,
    expectedTimeIn: '08:00',
    expectedTimeOut: '17:00',
    weeklyTarget: 40,
    autoBackup: 'off',
    lastBackupDate: null,
    notificationsEnabled: false,
    clockInReminder: '08:00',
    clockOutReminder: '17:00',
    timeFormat: '12h',
  },
  entries: [],
  holidays: [],
  theme: 'dark',
};

const API_BASE = '/api';

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class Store {
  constructor() {
    this.state = structuredClone(DEFAULT_STATE);
    this.listeners = [];
    this.undoStack = [];
    this.isHydrating = false;
    this.dataVersion = 0;
    this.resourceVersions = {
      entries: 0,
      holidays: 0,
      config: 0,
      auth: 0,
    };
    this.initSequence = 0;
    this.sortedEntriesCache = [];
    this.sortedEntriesCacheVersion = -1;
    this.monthEntriesCache = new Map();
    this.summaryStatsCache = null;
    this.summaryStatsCacheVersion = -1;
    this.pendingLocalSyncSkips = 0;
    this.syncInFlight = null;
    this.syncQueued = new Set();
    this.userId = localStorage.getItem('dtr_user_id') || null;
    this.username = localStorage.getItem('dtr_username') || null;
    if (this.userId) {
      this.init();
      this.startPolling();
    }
  }

  async init() {
    if (!this.userId) return;
    const sequence = ++this.initSequence;
    const dataVersionAtStart = this.dataVersion;
    let applied = false;
    this.isHydrating = true;
    this._notify({ resources: ['hydration'], forceRender: true });
    try {
      const headers = { 'X-User-Id': this.userId };
      const [entries, holidays, config] = await Promise.all([
        this._request('/entries', { headers }, { logoutOn401: true }),
        this._request('/holidays', { headers }, { logoutOn401: true }),
        this._request('/config', { headers }, { logoutOn401: true })
      ]);

      if (sequence !== this.initSequence || dataVersionAtStart !== this.dataVersion || !this.userId) {
        return;
      }

      this._applyServerState(entries, holidays, config);
      applied = true;
    } catch (e) {
      console.error('[Store] Failed to load data from server:', e);
    } finally {
      if (sequence === this.initSequence) {
        this.isHydrating = false;
      }
      if (!applied) {
        this._notify({ resources: ['hydration'], forceRender: true });
      }
    }
  }

  _notify(changes = {}) {
    const normalizedChanges = {
      resources: [...new Set(changes.resources || [])],
      forceRender: changes.forceRender === true,
    };
    this.listeners.forEach(fn => fn(this.state, normalizedChanges));
  }

  _invalidateEntryCaches() {
    this.sortedEntriesCacheVersion = -1;
    this.monthEntriesCache.clear();
    this.summaryStatsCache = null;
    this.summaryStatsCacheVersion = -1;
  }

  _markResourcesChanged(resources = []) {
    const uniqueResources = [...new Set(resources)];
    if (!uniqueResources.length) return uniqueResources;
    this.dataVersion += 1;
    uniqueResources.forEach(resource => {
      if (Object.hasOwn(this.resourceVersions, resource)) {
        this.resourceVersions[resource] += 1;
      }
    });
    if (uniqueResources.includes('entries')) {
      this._invalidateEntryCaches();
    }
    return uniqueResources;
  }

  getResourceVersion(resource) {
    return this.resourceVersions[resource] || 0;
  }

  _queueLocalSyncSkip() {
    this.pendingLocalSyncSkips += 1;
  }

  _consumeLocalSyncSkip() {
    if (this.pendingLocalSyncSkips > 0) {
      this.pendingLocalSyncSkips -= 1;
      return true;
    }
    return false;
  }

  _applyServerState(entries, holidays, config, resources = ['entries', 'holidays', 'config']) {
    const changedResources = [];

    if (resources.includes('entries')) {
      this.state.entries = entries;
      changedResources.push('entries');
    }

    if (resources.includes('holidays')) {
      this.state.holidays = holidays;
      changedResources.push('holidays');
    }

    if (resources.includes('config') && config) {
      this.state.profile = { ...DEFAULT_STATE.profile, ...config.profile };
      this.state.settings = { ...DEFAULT_STATE.settings, ...config.settings };
      const oldTheme = this.state.theme;
      this.state.theme = config.theme || 'dark';
      if (oldTheme !== this.state.theme) {
        document.body.className = this.state.theme === 'light' ? 'light-theme' : '';
      }
      changedResources.push('config');
    }

    const markedResources = this._markResourcesChanged(changedResources);
    this._notify({ resources: markedResources });
  }

  async _refreshFromServer() {
    return this._refreshResources(['entries', 'holidays', 'config']);
  }

  async _refreshResources(resources = ['entries', 'holidays', 'config']) {
    if (!this.userId) return;
    const resourceSet = new Set(resources);
    const headers = { 'X-User-Id': this.userId };
    const requests = [];

    if (resourceSet.has('entries')) {
      requests.push(this._request('/entries', { headers }, { logoutOn401: true }).then(entries => ({ key: 'entries', value: entries })));
    }
    if (resourceSet.has('holidays')) {
      requests.push(this._request('/holidays', { headers }, { logoutOn401: true }).then(holidays => ({ key: 'holidays', value: holidays })));
    }
    if (resourceSet.has('config')) {
      requests.push(this._request('/config', { headers }, { logoutOn401: true }).then(config => ({ key: 'config', value: config })));
    }

    if (!requests.length) return;

    const results = await Promise.all(requests);
    if (!this.userId) return;

    let entries = this.state.entries;
    let holidays = this.state.holidays;
    let config = {
      profile: this.state.profile,
      settings: this.state.settings,
      theme: this.state.theme,
    };

    for (const result of results) {
      if (result.key === 'entries') entries = result.value;
      else if (result.key === 'holidays') holidays = result.value;
      else if (result.key === 'config') config = result.value;
    }

    this._applyServerState(entries, holidays, config, [...resourceSet]);
  }

  _scheduleServerRefresh(resources = ['entries', 'holidays', 'config']) {
    if (!this.userId) return;
    const nextResources = new Set(resources);
    if (this.syncInFlight) {
      for (const resource of nextResources) this.syncQueued.add(resource);
      return this.syncInFlight;
    }

    this.syncQueued = new Set();
    this.syncInFlight = this._refreshResources(nextResources)
      .catch(err => {
        console.error('Real-time sync error:', err);
      })
      .finally(() => {
        this.syncInFlight = null;
        if (this.syncQueued.size) {
          const queuedResources = [...this.syncQueued];
          this.syncQueued.clear();
          this._scheduleServerRefresh(queuedResources);
        }
      });

    return this.syncInFlight;
  }

  async _request(path, options = {}, { logoutOn401 = false } = {}) {
    const res = await fetch(`${API_BASE}${path}`, options);
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => '');

    if (res.status === 401 && logoutOn401) {
      this.logout();
    }

    if (!res.ok) {
      const error = new Error(data?.error || (typeof data === 'string' && data) || `Request failed (${res.status})`);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  startPolling() {
    if (!this.userId || this.evtSource) return;
    this.evtSource = new EventSource(`${API_BASE}/sync?userId=${this.userId}`);
    this.evtSource.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'update') {
        if (this._consumeLocalSyncSkip()) {
          return;
        }
        const resources = Array.isArray(data.resources) && data.resources.length
          ? data.resources
          : ['entries', 'holidays', 'config'];
        this._scheduleServerRefresh(resources);
      }
    };
  }


  subscribe(fn) { 
    this.listeners.push(fn); 
    return () => { this.listeners = this.listeners.filter(l => l !== fn); }; 
  }

  // --- Auth ---
  async login(username, password) {
    const data = await this._request('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    this._setAuth(data.userId, data.username);
  }

  async register(username, password) {
    const data = await this._request('/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    this._setAuth(data.userId, data.username);
  }

  _setAuth(id, name) {
    this.userId = id;
    this.username = name;
    localStorage.setItem('dtr_user_id', id);
    localStorage.setItem('dtr_username', name);
    this._markResourcesChanged(['auth']);
    this.init();
    this.startPolling();
    // Trigger navigation and ensure re-render
    window.location.hash = '#/';
    window.dispatchEvent(new Event('hashchange'));
  }

  logout() {
    this.userId = null;
    this.username = null;
    localStorage.removeItem('dtr_user_id');
    localStorage.removeItem('dtr_username');
    if (this.evtSource) { this.evtSource.close(); this.evtSource = null; }
    this.state = structuredClone(DEFAULT_STATE);
    document.body.className = '';
    this.isHydrating = false;
    this._markResourcesChanged(['entries', 'holidays', 'config', 'auth']);
    this._notify({ resources: ['entries', 'holidays', 'config', 'auth'], forceRender: true });
    window.dispatchEvent(new Event('hashchange'));
  }

  // --- Entries CRUD ---
  async addEntry(entry) {
    entry.id = crypto.randomUUID();
    entry.createdAt = new Date().toISOString();
    this._queueLocalSyncSkip();
    const newEntry = await this._request('/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(entry)
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    
    this.state.entries.push(newEntry);
    this._markResourcesChanged(['entries']);
    this._notify({ resources: ['entries'] });
    return newEntry;
  }

  async updateEntry(id, updates) {
    const i = this.state.entries.findIndex(e => e.id === id);
    if (i === -1) return null;
    const previousEntry = structuredClone(this.state.entries[i]);
    this._pushUndo('update', previousEntry);
    this._queueLocalSyncSkip();
    let updatedEntry;
    try {
      updatedEntry = await this._request(`/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify({ ...updates, previousState: previousEntry })
      }, { logoutOn401: true });
    } catch (err) {
      if (err.status === 409 && err.data?.current) {
        this._consumeLocalSyncSkip();
        this.state.entries[i] = err.data.current;
        this._markResourcesChanged(['entries']);
        this._notify({ resources: ['entries'] });
        const conflictError = new Error('Entry changed elsewhere. Latest data was loaded.');
        conflictError.current = err.data.current;
        conflictError.conflicts = err.data.conflicts || [];
        conflictError.clientChangedFields = err.data.clientChangedFields || [];
        conflictError.serverChangedFields = err.data.serverChangedFields || [];
        throw conflictError;
      }
      this._consumeLocalSyncSkip();
      throw err;
    }
    
    this.state.entries[i] = updatedEntry;
    this._markResourcesChanged(['entries']);
    this._notify({ resources: ['entries'] });
    return updatedEntry;
  }

  async deleteEntry(id, { force = false } = {}) {
    const entry = this.state.entries.find(e => e.id === id);
    if (entry) this._pushUndo('delete', structuredClone(entry));
    this._queueLocalSyncSkip();
    try {
      await this._request(`/entries/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify({ previousState: entry || null, force })
      }, { logoutOn401: true });
    } catch (err) {
      if (err.status === 409 && err.data?.current) {
        this._consumeLocalSyncSkip();
        const index = this.state.entries.findIndex(e => e.id === id);
        if (index === -1) this.state.entries.push(err.data.current);
        else this.state.entries[index] = err.data.current;
        this._markResourcesChanged(['entries']);
        this._notify({ resources: ['entries'] });
        const conflictError = new Error('Entry changed elsewhere. Latest data was loaded.');
        conflictError.current = err.data.current;
        conflictError.conflicts = err.data.conflicts || [];
        throw conflictError;
      }
      this._consumeLocalSyncSkip();
      throw err;
    }
    
    this.state.entries = this.state.entries.filter(e => e.id !== id);
    this._markResourcesChanged(['entries']);
    this._notify({ resources: ['entries'] });
  }


  getEntry(id) { return this.state.entries.find(e => e.id === id) || null; }

  getActiveEntry() {
    return this.state.entries.find(e =>
      (e.amTimeIn && !e.amTimeOut) || (e.pmTimeIn && !e.pmTimeOut)
    ) || null;
  }

  getClockPhase(date) {
    const entry = this.state.entries.find(e => e.date === date);
    if (!entry) return { phase: 0, entry: null };
    if (entry.amTimeIn && !entry.amTimeOut) return { phase: 1, entry };
    if (!entry.pmTimeIn) return { phase: 2, entry };
    if (entry.pmTimeIn && !entry.pmTimeOut) return { phase: 3, entry };
    return { phase: 4, entry };
  }

  getEntriesByMonth(year, month) {
    const key = `${year}-${month}`;
    const entriesVersion = this.getResourceVersion('entries');
    const cached = this.monthEntriesCache.get(key);
    if (cached?.version === entriesVersion) {
      return cached.value;
    }

    const value = this.state.entries
      .filter(e => { const d = new Date(e.date); return d.getFullYear() === year && d.getMonth() === month; })
      .sort((a, b) => a.date.localeCompare(b.date));
    this.monthEntriesCache.set(key, { version: entriesVersion, value });
    return value;
  }

  getAllEntries() {
    const entriesVersion = this.getResourceVersion('entries');
    if (this.sortedEntriesCacheVersion !== entriesVersion) {
      this.sortedEntriesCache = [...this.state.entries].sort((a, b) => b.date.localeCompare(a.date));
      this.sortedEntriesCacheVersion = entriesVersion;
    }
    return this.sortedEntriesCache;
  }

  async fetchEntries({ dateFrom, dateTo, page, limit } = {}) {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (page != null) params.set('page', String(page));
    if (limit != null) params.set('limit', String(limit));
    const query = params.toString();
    return this._request(`/entries${query ? `?${query}` : ''}`, {
      headers: { 'X-User-Id': this.userId }
    }, { logoutOn401: true });
  }

  // --- Profile & Settings ---
  async updateProfile(p) { 
    const previousProfile = { ...this.state.profile };
    this.state.profile = { ...this.state.profile, ...p }; 
    try {
      await this._saveConfig();
    } catch (err) {
      this.state.profile = previousProfile;
      throw err;
    }
  }
  
  async updateSettings(s) { 
    const previousSettings = { ...this.state.settings };
    this.state.settings = { ...this.state.settings, ...s }; 
    try {
      await this._saveConfig();
    } catch (err) {
      this.state.settings = previousSettings;
      throw err;
    }
  }

  async _saveConfig() {
    this._queueLocalSyncSkip();
    const savedConfig = await this._request('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify({ 
        profile: this.state.profile, 
        settings: this.state.settings, 
        theme: this.state.theme 
      })
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    this.state.profile = { ...DEFAULT_STATE.profile, ...savedConfig.profile };
    this.state.settings = { ...DEFAULT_STATE.settings, ...savedConfig.settings };
    this.state.theme = savedConfig.theme || 'dark';
    document.body.className = this.state.theme === 'light' ? 'light-theme' : '';
    this._markResourcesChanged(['config']);
    this._notify({ resources: ['config'] });
  }

  // --- Holidays ---
  async addHoliday(h) {
    if (!this.state.holidays.find(x => x.date === h.date)) {
      this._queueLocalSyncSkip();
      const newHol = await this._request('/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify(h)
      }, { logoutOn401: true }).catch(err => {
        this._consumeLocalSyncSkip();
        throw err;
      });
      this.state.holidays.push(newHol);
      this._markResourcesChanged(['holidays']);
      this._notify({ resources: ['holidays'] });
    }
  }

  async removeHoliday(date) { 
    this._queueLocalSyncSkip();
    await this._request(`/holidays/${date}`, { method: 'DELETE', headers: { 'X-User-Id': this.userId } }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    this.state.holidays = this.state.holidays.filter(h => h.date !== date); 
    this._markResourcesChanged(['holidays']);
    this._notify({ resources: ['holidays'] });
  }

  async restoreHoliday(snapshot) {
    if (!snapshot?.date) throw new Error('Missing holiday snapshot');
    this._queueLocalSyncSkip();
    const restored = await this._request(`/holidays/${snapshot.date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(snapshot)
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });

    const index = this.state.holidays.findIndex(holiday => holiday.date === restored.date);
    if (index === -1) this.state.holidays.push(restored);
    else this.state.holidays[index] = restored;
    this._markResourcesChanged(['holidays']);
    this._notify({ resources: ['holidays'] });
    return restored;
  }

  async restoreConfig(snapshot) {
    if (!snapshot) throw new Error('Missing config snapshot');
    this._queueLocalSyncSkip();
    await this._request('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(snapshot)
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    await this.init();
  }

  getHolidaysInMonth(y, m) {
    return this.state.holidays.filter(h => { const d = new Date(h.date); return d.getFullYear() === y && d.getMonth() === m; });
  }
  isHoliday(date) { return this.state.holidays.find(h => h.date === date) || null; }

  // --- Theme ---
  async setTheme(t) { 
    const previousTheme = this.state.theme;
    this.state.theme = t; 
    document.body.className = t === 'light' ? 'light-theme' : ''; 
    try {
      await this._saveConfig();
    } catch (err) {
      this.state.theme = previousTheme;
      document.body.className = previousTheme === 'light' ? 'light-theme' : '';
      throw err;
    }
  }


  // --- Undo ---
  _pushUndo(action, data) {
    this.undoStack.push({ action, data, ts: Date.now() });
    if (this.undoStack.length > 30) this.undoStack.shift();
  }
  async undo() {
    const last = this.undoStack.pop();
    if (!last) return false;
    if (last.action === 'delete') {
      await this.addEntry(last.data);
    } else if (last.action === 'update') {
      await this.updateEntry(last.data.id, last.data);
    }
    return true;
  }

  canUndo() { return this.undoStack.length > 0; }

  // --- Computed Stats ---
  _getSummaryStats() {
    const entriesVersion = this.getResourceVersion('entries');
    if (this.summaryStatsCacheVersion === entriesVersion && this.summaryStatsCache) {
      return this.summaryStatsCache;
    }

    const attendedDates = new Set();
    const stats = {
      totalHours: 0,
      totalOvertime: 0,
      totalLateMinutes: 0,
      totalUndertimeMinutes: 0,
      daysAttended: 0,
    };

    for (const entry of this.state.entries) {
      stats.totalHours += parseFloat(entry.hoursRendered) || 0;
      stats.totalOvertime += parseFloat(entry.overtimeHours) || 0;
      stats.totalLateMinutes += parseInt(entry.lateMinutes) || 0;
      stats.totalUndertimeMinutes += parseInt(entry.undertimeMinutes) || 0;
      if (entry.amTimeOut || entry.pmTimeOut) {
        attendedDates.add(entry.date);
      }
    }

    stats.daysAttended = attendedDates.size;
    this.summaryStatsCache = stats;
    this.summaryStatsCacheVersion = entriesVersion;
    return stats;
  }

  getTotalHours() { return this._getSummaryStats().totalHours; }
  getTotalOvertime() { return this._getSummaryStats().totalOvertime; }
  getTotalLateMinutes() { return this._getSummaryStats().totalLateMinutes; }
  getTotalUndertimeMinutes() { return this._getSummaryStats().totalUndertimeMinutes; }
  getRequiredHours() { return this.state.settings.requiredHours; }
  getRemainingHours() { return Math.max(0, this.getRequiredHours() - this.getTotalHours()); }
  getProgress() { const r = this.getRequiredHours(); return r === 0 ? 0 : Math.min(100, (this.getTotalHours() / r) * 100); }
  getDaysAttended() { return this._getSummaryStats().daysAttended; }

  getAttendanceSummary(year, month) {
    const entries = year != null ? this.getEntriesByMonth(year, month) : this.state.entries;
    const holidays = this.state.holidays;
    let present = 0, late = 0, onLeave = 0;
    const entryDates = new Set();
    entries.forEach(e => {
      if (e.amTimeOut || e.pmTimeOut) { present++; entryDates.add(e.date); }
      if (e.lateMinutes > 0) late++;
    });
    holidays.forEach(h => {
      if (year == null || (new Date(h.date).getFullYear() === year && new Date(h.date).getMonth() === month)) {
        if (h.type !== 'holiday') onLeave++;
      }
    });
    return { present, late, onLeave, holidays: holidays.filter(h => h.type === 'holiday').length };
  }

  getCompletionEstimate() {
    const days = this.getDaysAttended();
    if (days === 0) return null;
    const avgPerDay = this.getTotalHours() / days;
    if (avgPerDay <= 0) return null;
    const remaining = this.getRemainingHours();
    const daysNeeded = Math.ceil(remaining / avgPerDay);
    // Skip weekends in estimate
    let estDate = new Date();
    let count = 0;
    while (count < daysNeeded) {
      estDate.setDate(estDate.getDate() + 1);
      const day = estDate.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return { avgPerDay, daysNeeded, estimatedDate: toLocalDateString(estDate) };
  }

  getCurrentWeekHours() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const mondayStr = toLocalDateString(monday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = toLocalDateString(sunday);
    return this.state.entries
      .filter(e => e.date >= mondayStr && e.date <= sundayStr)
      .reduce((s, e) => s + (parseFloat(e.hoursRendered) || 0), 0);
  }

  // --- Data Management ---
  exportData() { return JSON.stringify(this.state, null, 2); }
  async previewImport(json) {
    const data = JSON.parse(json);
    return this._request('/import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(data)
    }, { logoutOn401: true });
  }

  async importData(json) {
    try {
      const data = JSON.parse(json);
      this._queueLocalSyncSkip();
      await this._request('/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify(data)
      }, { logoutOn401: true }).catch(err => {
        this._consumeLocalSyncSkip();
        throw err;
      });
      
      // Refresh local state
      await this.init();
      return true;
    } catch (err) {
      console.error('Import failed:', err);
      return false;
    }
  }

  async restoreEntry(snapshot) {
    if (!snapshot?.id) throw new Error('Missing entry snapshot');

    const existingIndex = this.state.entries.findIndex(entry => entry.id === snapshot.id);
    const method = existingIndex === -1 ? 'POST' : 'PUT';
    const path = existingIndex === -1 ? '/entries' : `/entries/${snapshot.id}`;
    const body = existingIndex === -1
      ? snapshot
      : { ...snapshot, previousState: structuredClone(this.state.entries[existingIndex]) };

    this._queueLocalSyncSkip();
    const restored = await this._request(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(body)
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });

    if (existingIndex === -1) {
      this.state.entries.push(restored);
    } else {
      this.state.entries[existingIndex] = restored;
    }
    this._markResourcesChanged(['entries']);
    this._notify({ resources: ['entries'] });
    return restored;
  }

  async restoreStateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Missing state snapshot');
    this._queueLocalSyncSkip();
    await this._request('/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(snapshot)
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    await this.init();
  }

  async forceDeleteEntry(id) {
    return this.deleteEntry(id, { force: true });
  }

  async clearAllData() {
    try {
      this._queueLocalSyncSkip();
      await this._request('/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify(DEFAULT_STATE)
      }, { logoutOn401: true }).catch(err => {
        this._consumeLocalSyncSkip();
        throw err;
      });
      this.state = structuredClone(DEFAULT_STATE);
      document.body.className = '';
      this._markResourcesChanged(['entries', 'holidays', 'config']);
      this._notify({ resources: ['entries', 'holidays', 'config'] });
    } catch (err) {
      console.error('Clear data failed:', err);
      throw err;
    }
  }
}

export const store = new Store();
