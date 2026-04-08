import { getScheduledNonWorkingStatus, isScheduledWorkday } from '../shared/work-schedule.js';

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
const ENTRY_STATUSES = new Set(['present', 'leave', 'vacation', 'holiday', 'no_ojt', 'absent']);
const NON_WORKING_STATUSES = new Set(['leave', 'vacation', 'holiday', 'no_ojt', 'absent']);
const DEFAULT_ACTIVITY_TEMPLATES = [
  { id: 'template-documentation', name: 'Documentation', activities: 'Updated documentation and organized work output.', remarks: '' },
  { id: 'template-testing', name: 'Testing', activities: 'Tested implemented features and validated expected behavior.', remarks: '' },
  { id: 'template-development', name: 'Development', activities: 'Implemented assigned tasks and reviewed related code changes.', remarks: '' },
];

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYearMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getWeekStartKey(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay());
  return toLocalDateString(weekStart);
}

function normalizeEntryStatus(entry = {}) {
  const normalized = String(entry.status || '').trim().toLowerCase();
  const scheduledNonWorkingStatus = getScheduledNonWorkingStatus(entry.date || '');
  if (ENTRY_STATUSES.has(normalized)) {
    if (normalized === 'absent' && scheduledNonWorkingStatus) return scheduledNonWorkingStatus;
    return normalized;
  }
  if (entry.amTimeIn || entry.amTimeOut || entry.pmTimeIn || entry.pmTimeOut || Number(entry.hoursRendered) > 0) {
    return 'present';
  }
  if (scheduledNonWorkingStatus) return scheduledNonWorkingStatus;
  return 'absent';
}

function formatStatusLabel(status) {
  return String(status || 'absent')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function isWeekday(dateString) {
  return isScheduledWorkday(dateString);
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
    this.entryDateCache = new Map();
    this.entryDateCacheVersion = -1;
    this.monthEntriesCache = new Map();
    this.holidayDateCache = new Map();
    this.holidayDateCacheVersion = -1;
    this.monthHolidaysCache = new Map();
    this.summaryStatsCache = null;
    this.summaryStatsCacheVersion = -1;
    this.trendDataCache = null;
    this.trendDataCacheVersion = -1;
    this.pendingLocalSyncSkips = 0;
    this.syncInFlight = null;
    this.syncQueued = new Set();
    this.syncedHolidayYears = new Set();
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
    this.entryDateCache = new Map();
    this.entryDateCacheVersion = -1;
    this.monthEntriesCache.clear();
    this.summaryStatsCache = null;
    this.summaryStatsCacheVersion = -1;
    this.trendDataCache = null;
    this.trendDataCacheVersion = -1;
  }

  _invalidateHolidayCaches() {
    this.holidayDateCache = new Map();
    this.holidayDateCacheVersion = -1;
    this.monthHolidaysCache.clear();
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
    if (uniqueResources.includes('holidays')) {
      this._invalidateHolidayCaches();
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
      this.syncedHolidayYears = new Set((Array.isArray(holidays) ? holidays : [])
        .map(holiday => Number.parseInt(String(holiday?.date || '').slice(0, 4), 10))
        .filter(year => Number.isInteger(year)));
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
    this.syncedHolidayYears = new Set();
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
  getEntryStatus(entry) { return normalizeEntryStatus(entry); }
  formatStatusLabel(status) { return formatStatusLabel(status); }

  _getEntryDateMap() {
    const entriesVersion = this.getResourceVersion('entries');
    if (this.entryDateCacheVersion !== entriesVersion) {
      this.entryDateCache = new Map(this.state.entries.map(entry => [entry.date, entry]));
      this.entryDateCacheVersion = entriesVersion;
    }
    return this.entryDateCache;
  }

  _getHolidayDateMap() {
    const holidaysVersion = this.getResourceVersion('holidays');
    if (this.holidayDateCacheVersion !== holidaysVersion) {
      this.holidayDateCache = new Map(this.state.holidays.map(holiday => [holiday.date, holiday]));
      this.holidayDateCacheVersion = holidaysVersion;
    }
    return this.holidayDateCache;
  }

  _getTrendData() {
    const entriesVersion = this.getResourceVersion('entries');
    if (this.trendDataCacheVersion === entriesVersion && this.trendDataCache) {
      return this.trendDataCache;
    }

    const monthly = Object.create(null);
    const weekly = Object.create(null);

    for (const entry of this.state.entries) {
      if (!entry.amTimeOut && !entry.pmTimeOut) continue;

      const monthKey = entry.date.slice(0, 7);
      if (!monthly[monthKey]) {
        monthly[monthKey] = { hours: 0, ot: 0, late: 0, undertime: 0, days: 0 };
      }
      monthly[monthKey].hours += entry.hoursRendered || 0;
      monthly[monthKey].ot += entry.overtimeHours || 0;
      monthly[monthKey].late += entry.lateMinutes || 0;
      monthly[monthKey].undertime += entry.undertimeMinutes || 0;
      monthly[monthKey].days += 1;

      const weekKey = getWeekStartKey(entry.date);
      if (!weekly[weekKey]) {
        weekly[weekKey] = { hours: 0, days: 0 };
      }
      weekly[weekKey].hours += entry.hoursRendered || 0;
      weekly[weekKey].days += 1;
    }

    this.trendDataCache = { monthly, weekly };
    this.trendDataCacheVersion = entriesVersion;
    return this.trendDataCache;
  }

  getEntryByDate(date) {
    return this._getEntryDateMap().get(date) || null;
  }

  getEntryOrStatusByDate(date) {
    const entry = this.getEntryByDate(date);
    if (entry) return { ...entry, status: normalizeEntryStatus(entry), source: 'entry' };

    const holiday = this.isHoliday(date);
    if (!holiday) {
      const scheduledNonWorkingStatus = getScheduledNonWorkingStatus(date);
      if (!scheduledNonWorkingStatus) return null;

      return {
        id: `status-${date}`,
        date,
        status: scheduledNonWorkingStatus,
        amTimeIn: '',
        amTimeOut: '',
        pmTimeIn: '',
        pmTimeOut: '',
        hoursRendered: 0,
        overtimeHours: 0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        remarks: '',
        activities: '',
        source: 'schedule',
      };
    }

    return {
      id: `status-${date}`,
      date,
      status: holiday.type === 'holiday' ? 'holiday' : holiday.type === 'vacation_leave' ? 'vacation' : 'leave',
      amTimeIn: '',
      amTimeOut: '',
      pmTimeIn: '',
      pmTimeOut: '',
      hoursRendered: 0,
      overtimeHours: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      remarks: holiday.name || '',
      activities: '',
      source: 'holiday',
    };
  }

  getActiveEntry() {
    return this.state.entries.find(e =>
      (e.amTimeIn && !e.amTimeOut) || (e.pmTimeIn && !e.pmTimeOut)
    ) || null;
  }

  getClockPhase(date) {
    const entry = this.getEntryByDate(date);
    if (!entry) return { phase: 0, entry: null };
    if (entry.amTimeIn && !entry.amTimeOut) return { phase: 1, entry };
    if (!entry.pmTimeIn) return { phase: 2, entry };
    if (entry.pmTimeIn && !entry.pmTimeOut) return { phase: 3, entry };
    return { phase: 4, entry };
  }

  getEntriesByMonth(year, month) {
    const key = getYearMonthKey(year, month);
    const entriesVersion = this.getResourceVersion('entries');
    const cached = this.monthEntriesCache.get(key);
    if (cached?.version === entriesVersion) {
      return cached.value;
    }

    const prefix = `${key}-`;
    const value = this.state.entries
      .filter(entry => entry.date.startsWith(prefix))
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

  getAllEntriesWithDerivedStatus() {
    return this.getAllEntries().map(entry => ({ ...entry, status: normalizeEntryStatus(entry) }));
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

    await this.refreshHolidays([], { force: true }).catch(err => {
      console.error('[Store] Failed to refresh holidays after config update:', err);
      return null;
    });

    this._markResourcesChanged(['config']);
    this._notify({ resources: ['config'] });
  }

  // --- Holidays ---
  async fetchHolidays(years = []) {
    const normalizedYears = [...new Set((Array.isArray(years) ? years : [])
      .map(year => Number.parseInt(year, 10))
      .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100))]
      .sort((a, b) => a - b);

    const params = new URLSearchParams();
    if (normalizedYears.length) params.set('years', normalizedYears.join(','));

    return this._request(`/holidays${params.toString() ? `?${params}` : ''}`, {
      headers: { 'X-User-Id': this.userId }
    }, { logoutOn401: true });
  }

  async refreshHolidays(years = [], { force = false } = {}) {
    const normalizedYears = [...new Set((Array.isArray(years) ? years : [])
      .map(year => Number.parseInt(year, 10))
      .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100))]
      .sort((a, b) => a - b);

    if (!force && normalizedYears.length && normalizedYears.every(year => this.syncedHolidayYears.has(year))) {
      return this.state.holidays;
    }

    const holidays = await this.fetchHolidays(years);
    if (!Array.isArray(holidays)) return null;
    this.state.holidays = holidays;
    if (normalizedYears.length) {
      normalizedYears.forEach(year => this.syncedHolidayYears.add(year));
    } else {
      this.syncedHolidayYears = new Set(holidays
        .map(holiday => Number.parseInt(String(holiday?.date || '').slice(0, 4), 10))
        .filter(year => Number.isInteger(year)));
    }
    this._markResourcesChanged(['holidays']);
    this._notify({ resources: ['holidays'] });
    return holidays;
  }

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
    const key = getYearMonthKey(y, m);
    const holidaysVersion = this.getResourceVersion('holidays');
    const cached = this.monthHolidaysCache.get(key);
    if (cached?.version === holidaysVersion) {
      return cached.value;
    }

    const prefix = `${key}-`;
    const value = this.state.holidays
      .filter(holiday => holiday.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
    this.monthHolidaysCache.set(key, { version: holidaysVersion, value });
    return value;
  }
  isHoliday(date) { return this._getHolidayDateMap().get(date) || null; }

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
      const status = normalizeEntryStatus(entry);
      if (status !== 'present') continue;

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
  getMonthlyTrendData() { return this._getTrendData().monthly; }
  getWeeklyTrendData() { return this._getTrendData().weekly; }

  getStatusSummary(year, month) {
    const summary = {
      present: 0,
      leave: 0,
      vacation: 0,
      holiday: 0,
      no_ojt: 0,
      absent: 0,
    };

    const entries = year != null ? this.getEntriesByMonth(year, month) : this.state.entries;
    entries.forEach(entry => {
      const status = normalizeEntryStatus(entry);
      if (Object.hasOwn(summary, status)) summary[status] += 1;
    });

    const holidays = year != null ? this.getHolidaysInMonth(year, month) : this.state.holidays;
    holidays.forEach(holiday => {
      if (this.getEntryByDate(holiday.date)) return;
      if (holiday.type === 'holiday') summary.holiday += 1;
      else if (holiday.type === 'vacation_leave') summary.vacation += 1;
      else summary.leave += 1;
    });

    return summary;
  }

  getAttendanceSummary(year, month) {
    const entries = year != null ? this.getEntriesByMonth(year, month) : this.state.entries;
    const statusSummary = this.getStatusSummary(year, month);
    let present = 0, late = 0;
    entries.forEach(e => {
      const status = normalizeEntryStatus(e);
      if (status === 'present' && (e.amTimeOut || e.pmTimeOut)) present++;
      if (status === 'present' && e.lateMinutes > 0) late++;
    });
    return {
      present,
      late,
      onLeave: statusSummary.leave + statusSummary.vacation + statusSummary.no_ojt,
      holidays: statusSummary.holiday,
    };
  }

  getCompletionEstimate() {
    const forecast = this.getCompletionForecast();
    if (!forecast) return null;
    return {
      avgPerDay: forecast.avgPerDay,
      daysNeeded: forecast.workingDaysRemaining,
      estimatedDate: forecast.estimatedDate,
      remainingHours: forecast.remainingHours,
      neededAvgHoursPerDay: forecast.neededAvgHoursPerDay,
      excludedDates: forecast.excludedDates,
    };
  }

  getCompletionForecast(today = toLocalDateString(new Date())) {
    const presentEntries = this.state.entries
      .map(entry => ({ ...entry, status: normalizeEntryStatus(entry) }))
      .filter(entry => entry.status === 'present' && (parseFloat(entry.hoursRendered) || 0) > 0);

    if (!presentEntries.length) return null;

    const totalHours = presentEntries.reduce((sum, entry) => sum + (parseFloat(entry.hoursRendered) || 0), 0);
    const avgPerDay = totalHours / presentEntries.length;
    if (avgPerDay <= 0) return null;

    const remainingHours = Math.max(0, this.getRequiredHours() - totalHours);
    if (remainingHours === 0) {
      return {
        avgPerDay,
        remainingHours,
        workingDaysRemaining: 0,
        neededAvgHoursPerDay: 0,
        estimatedDate: today,
        excludedDates: [],
      };
    }

    const statusByDate = new Map();
    this.state.entries.forEach(entry => {
      statusByDate.set(entry.date, normalizeEntryStatus(entry));
    });
    this.state.holidays.forEach(holiday => {
      if (statusByDate.has(holiday.date)) return;
      statusByDate.set(
        holiday.date,
        holiday.type === 'holiday' ? 'holiday' : holiday.type === 'vacation_leave' ? 'vacation' : 'leave'
      );
    });

    const workingDaysRemaining = Math.ceil(remainingHours / avgPerDay);
    const excludedDates = [];
    const cursor = new Date(`${today}T00:00:00`);
    let countedDays = 0;

    while (countedDays < workingDaysRemaining) {
      cursor.setDate(cursor.getDate() + 1);
      const dateKey = toLocalDateString(cursor);
      const status = statusByDate.get(dateKey);

      if (!isWeekday(dateKey)) continue;
      if (NON_WORKING_STATUSES.has(status) && status !== 'absent') {
        excludedDates.push({ date: dateKey, status });
        continue;
      }
      countedDays += 1;
    }

    return {
      avgPerDay,
      remainingHours,
      workingDaysRemaining,
      neededAvgHoursPerDay: remainingHours / workingDaysRemaining,
      estimatedDate: toLocalDateString(cursor),
      excludedDates,
    };
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
      .filter(e => e.date >= mondayStr && e.date <= sundayStr && normalizeEntryStatus(e) === 'present')
      .reduce((s, e) => s + (parseFloat(e.hoursRendered) || 0), 0);
  }

  getDataQualityAlerts() {
    const alerts = [];

    this.getAllEntriesWithDerivedStatus().forEach(entry => {
      if (entry.status !== 'present') return;

      if ((entry.amTimeIn && !entry.amTimeOut) || (entry.pmTimeIn && !entry.pmTimeOut)) {
        alerts.push({ type: 'incomplete', date: entry.date, message: 'Present day has an incomplete clock pair.' });
      }
      if ((parseFloat(entry.hoursRendered) || 0) > 0 && !String(entry.activities || '').trim()) {
        alerts.push({ type: 'missing_activity', date: entry.date, message: 'Worked day is missing activity details.' });
      }
      if ((parseFloat(entry.hoursRendered) || 0) > 0 && (parseFloat(entry.hoursRendered) || 0) < 4) {
        alerts.push({ type: 'short_day', date: entry.date, message: 'Worked day looks unusually short.' });
      }
    });

    return alerts;
  }

  getActivityTemplates() {
    const saved = JSON.parse(localStorage.getItem('dtr_activity_templates') || 'null');
    return Array.isArray(saved) && saved.length ? saved : DEFAULT_ACTIVITY_TEMPLATES;
  }

  saveActivityTemplate(template) {
    const templates = this.getActivityTemplates().filter(item => item.id !== template.id);
    templates.unshift({
      id: template.id || crypto.randomUUID(),
      name: String(template.name || '').trim(),
      activities: String(template.activities || '').trim(),
      remarks: String(template.remarks || '').trim(),
    });
    localStorage.setItem('dtr_activity_templates', JSON.stringify(templates.slice(0, 20)));
    return this.getActivityTemplates();
  }

  deleteActivityTemplate(id) {
    const templates = this.getActivityTemplates().filter(item => item.id !== id);
    localStorage.setItem('dtr_activity_templates', JSON.stringify(templates));
    return templates;
  }

  async applyTemplateToDates(templateId, dates = [], { overwrite = false } = {}) {
    const template = this.getActivityTemplates().find(item => item.id === templateId);
    if (!template) throw new Error('Template not found');

    for (const date of dates) {
      const current = this.getEntryByDate(date);
      if (current) {
        await this.updateEntry(current.id, {
          ...current,
          status: normalizeEntryStatus(current),
          activities: overwrite || !String(current.activities || '').trim() ? template.activities : current.activities,
          remarks: overwrite || !String(current.remarks || '').trim() ? template.remarks : current.remarks,
        });
      } else {
        await this.addEntry({
          date,
          status: 'absent',
          activities: template.activities,
          remarks: template.remarks,
        });
      }
    }
  }

  findPreviousWorkingEntry(date) {
    return this.getAllEntriesWithDerivedStatus().find(entry => entry.date < date && entry.status === 'present' && String(entry.activities || '').trim()) || null;
  }

  async reusePreviousWorkingDay(date, { overwrite = false } = {}) {
    const previous = this.findPreviousWorkingEntry(date);
    if (!previous) throw new Error('No previous working day with activities found');

    const current = this.getEntryByDate(date);
    if (current) {
      await this.updateEntry(current.id, {
        ...current,
        status: normalizeEntryStatus(current),
        activities: overwrite || !String(current.activities || '').trim() ? previous.activities : current.activities,
        remarks: overwrite || !String(current.remarks || '').trim() ? previous.remarks : current.remarks,
      });
      return;
    }

    await this.addEntry({
      date,
      status: 'absent',
      activities: previous.activities,
      remarks: previous.remarks,
    });
  }

  async batchUpdateStatuses(dates = [], status, { overwrite = false } = {}) {
    const normalizedStatus = normalizeEntryStatus({ status });
    for (const date of dates) {
      const current = this.getEntryByDate(date);
      if (current) {
        if (!overwrite && normalizeEntryStatus(current) === normalizedStatus) continue;
        await this.updateEntry(current.id, { ...current, status: normalizedStatus });
      } else {
        await this.addEntry({ date, status: normalizedStatus, remarks: '', activities: '' });
      }
    }
  }

  getSummaryPack({ dateFrom, dateTo } = {}) {
    const entries = this.getAllEntriesWithDerivedStatus()
      .filter(entry => (!dateFrom || entry.date >= dateFrom) && (!dateTo || entry.date <= dateTo));
    const totals = entries.reduce((acc, entry) => {
      acc.totalHours += parseFloat(entry.hoursRendered) || 0;
      acc.totalOvertime += parseFloat(entry.overtimeHours) || 0;
      acc.totalLate += parseInt(entry.lateMinutes) || 0;
      acc.totalUndertime += parseInt(entry.undertimeMinutes) || 0;
      acc.statuses[entry.status] = (acc.statuses[entry.status] || 0) + 1;
      return acc;
    }, {
      totalHours: 0,
      totalOvertime: 0,
      totalLate: 0,
      totalUndertime: 0,
      statuses: { present: 0, leave: 0, vacation: 0, holiday: 0, no_ojt: 0, absent: 0 },
    });

    const activityCounts = new Map();
    entries.forEach(entry => {
      String(entry.activities || '')
        .split(/\n|;/)
        .map(item => item.trim())
        .filter(Boolean)
        .forEach(item => activityCounts.set(item, (activityCounts.get(item) || 0) + 1));
    });

    const highlights = [...activityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([activity, count]) => ({ activity, count }));

    return {
      ...totals,
      entries,
      highlights,
      narrative: `Completed ${totals.totalHours.toFixed(1)} hours with ${totals.statuses.present} present day(s) in the selected period.`,
    };
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
