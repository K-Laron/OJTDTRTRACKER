import { signOffMonth, retractMonthSignOff, getMonthSignOff } from './lib/store-signoff.js';
import { getScheduledNonWorkingStatus, isScheduledWorkday } from '../shared/work-schedule.js';
import { toLocalDateString } from '../shared/time.js';
import { request as apiRequest } from './api/client.js';
import {
  ENTRY_STATUSES,
  NON_WORKING_STATUSES,
  collapseEntriesByDate,
  formatStatusLabel,
  normalizeEntryStatus,
  upsertEntryForDate,
} from './lib/entries.js';
import {
  getActivityTemplates,
  saveActivityTemplate,
  deleteActivityTemplate,
} from './lib/activity-templates.js';
import {
  computeAttendanceSummary,
  computeCurrentWeekHours,
  computeDataQualityAlerts,
  computeStatusSummary,
  computeSummaryPack,
  computeSummaryStats,
  computeCompletionEstimate,
  computeCompletionForecast,
  computeTrendData,
  resolveEntryOrStatusByDate,
} from './lib/store-analytics.js';
import {
  applyTemplateToDates,
  batchUpdateStatuses,
  findPreviousWorkingEntry,
  reusePreviousWorkingDay,
} from './lib/store-batch.js';
import {
  clearAllData,
  exportData,
  importData,
  previewImport,
  restoreConfig,
  restoreEntry,
  restoreHoliday,
  restoreStateSnapshot,
} from './lib/store-data-transfer.js';
import {
  fetchAllEntries,
  refreshResources,
} from './lib/store-sync.js';

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
  signOffs: {},
};

const API_BASE = '/api';
const INIT_PAGE_LIMIT = 500;
function getYearMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getWeekStartKey(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay());
  return toLocalDateString(weekStart);
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
    this.derivedStatusCache = [];
    this.derivedStatusCacheVersion = -1;
    this.entryDateCache = new Map();
    this.entryDateCacheVersion = -1;
    this.monthEntriesCache = new Map();
    this.holidayDateCache = new Map();
    this.holidayDateCacheVersion = -1;
    this.monthHolidaysCache = new Map();
    this.summaryStatsCache = null;
    this.summaryStatsCacheVersion = -1;
    this.alertsCache = [];
    this.alertsCacheVersion = -1;
    this.summaryPackCache = null;
    this.summaryPackCacheKey = '';
    this.statusSummaryCache = new Map();
    this.attendanceCache = new Map();
    this.forecastCache = null;
    this.forecastCacheKey = '';
    this.currentWeekHoursCache = null;
    this.currentWeekHoursCacheKey = '';
    this.trendDataCache = null;
    this.trendDataCacheVersion = -1;
    this.pendingLocalSyncSkips = 0;
    this.syncInFlight = null;
    this.syncQueued = new Set();
    this.syncedHolidayYears = new Set();
    this.userId = localStorage.getItem('dtr_user_id') || null;
    this.username = localStorage.getItem('dtr_username') || null;
    this.authToken = localStorage.getItem('dtr_auth_token') || null;
    if (this.userId && this.authToken) {
      this.init();
      this.startPolling();
    } else if (this.userId) {
      // The server now requires a session token, so a stored userId alone is
      // no longer a usable session. Drop it instead of retrying into a 401.
      this.logout();
    }
  }

  getAuthHeaders(extra = {}) {
    return {
      ...extra,
      'X-User-Id': this.userId,
      'X-Auth-Token': this.authToken,
    };
  }

  async _fetchAllEntries(headers, isCurrent) {
    return fetchAllEntries({
      request: (...args) => this._request(...args),
      headers,
      isCurrent,
      pageLimit: INIT_PAGE_LIMIT,
    });
  }

  async init() {
    if (!this.userId || !this.authToken) return;
    const sequence = ++this.initSequence;
    const dataVersionAtStart = this.dataVersion;
    let applied = false;
    this.isHydrating = true;
    this._notify({ resources: ['hydration'], forceRender: true });
    try {
      const headers = this.getAuthHeaders();
      const isCurrent = () => sequence === this.initSequence && !!this.userId;
      const [entries, holidays, config] = await Promise.all([
        this._fetchAllEntries(headers, isCurrent),
        this._request('/holidays', { headers }, { logoutOn401: true }),
        this._request('/config', { headers }, { logoutOn401: true })
      ]);

      if (!entries || sequence !== this.initSequence || dataVersionAtStart !== this.dataVersion || !this.userId) {
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
    this.derivedStatusCacheVersion = -1;
    this.entryDateCache = new Map();
    this.entryDateCacheVersion = -1;
    this.monthEntriesCache.clear();
    this.summaryStatsCache = null;
    this.summaryStatsCacheVersion = -1;
    this.alertsCache = [];
    this.alertsCacheVersion = -1;
    this.summaryPackCache = null;
    this.summaryPackCacheKey = '';
    this.statusSummaryCache.clear();
    this.attendanceCache.clear();
    this.forecastCache = null;
    this.forecastCacheKey = '';
    this.trendDataCache = null;
    this.trendDataCacheVersion = -1;
  }

  _invalidateHolidayCaches() {
    this.holidayDateCache = new Map();
    this.holidayDateCacheVersion = -1;
    this.monthHolidaysCache.clear();
    this.statusSummaryCache.clear();
    this.attendanceCache.clear();
    this.forecastCache = null;
    this.forecastCacheKey = '';
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
    if (uniqueResources.includes('config')) {
      this.forecastCache = null;
      this.forecastCacheKey = '';
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
      this.state.entries = collapseEntriesByDate(entries);
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
      this.state.signOffs = config.signOffs || {};
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
    return refreshResources(this, resources);
  }

  _scheduleServerRefresh(resources = ['entries', 'holidays', 'config']) {
    if (!this.userId || !this.authToken) return;
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
    return apiRequest(path, options, logoutOn401 ? { on401: () => this.logout() } : undefined);
  }

  startPolling() {
    if (!this.userId || !this.authToken || this.evtSource) return;
    const syncQuery = new URLSearchParams({ userId: this.userId, authToken: this.authToken });
    this.evtSource = new EventSource(`${API_BASE}/sync?${syncQuery}`);
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
    this._setAuth(data.userId, data.username, data.authToken);
  }

  async changePassword(currentPassword, newPassword) {
    return this._request("/auth/change-password", {
      method: "POST",
      headers: { ...this.getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

    async register(username, password) {
    const data = await this._request('/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    this._setAuth(data.userId, data.username, data.authToken);
  }

  _setAuth(id, name, authToken) {
    this.userId = id;
    this.username = name;
    this.authToken = authToken;
    localStorage.setItem('dtr_user_id', id);
    localStorage.setItem('dtr_username', name);
    localStorage.setItem('dtr_auth_token', authToken);
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
    this.authToken = null;
    localStorage.removeItem('dtr_user_id');
    localStorage.removeItem('dtr_username');
    localStorage.removeItem('dtr_auth_token');
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
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(entry)
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    
    this.state.entries = upsertEntryForDate(this.state.entries, newEntry);
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ previousState: entry || null, force })
      }, { logoutOn401: true });
    } catch (err) {
      if (err.status === 409 && err.data?.current) {
        this._consumeLocalSyncSkip();
        const index = this.state.entries.findIndex(e => e.id === id);
        this.state.entries = index === -1
          ? upsertEntryForDate(this.state.entries, err.data.current)
          : this.state.entries.map((e, i) => (i === index ? err.data.current : e));
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
    this.trendDataCache = computeTrendData(this.state.entries, getWeekStartKey);
    this.trendDataCacheVersion = entriesVersion;
    return this.trendDataCache;
  }

  getEntryByDate(date) {
    return this._getEntryDateMap().get(date) || null;
  }

  getEntryOrStatusByDate(date) {
    return resolveEntryOrStatusByDate({
      date,
      entry: this.getEntryByDate(date),
      holiday: this.isHoliday(date),
      scheduledNonWorkingStatus: getScheduledNonWorkingStatus(date),
      normalizeEntryStatus,
    });
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
    const entriesVersion = this.getResourceVersion('entries');
    if (this.derivedStatusCacheVersion !== entriesVersion) {
      this.derivedStatusCache = this.getAllEntries().map(entry => ({ ...entry, status: normalizeEntryStatus(entry) }));
      this.derivedStatusCacheVersion = entriesVersion;
    }
    return this.derivedStatusCache;
  }

  async fetchAuditEvents({ limit = 50 } = {}) {
    return this._request(`/audit?limit=${encodeURIComponent(limit)}`, {
      headers: this.getAuthHeaders(),
    }, { logoutOn401: true });
  }

  async fetchEntries({ dateFrom, dateTo, page, limit } = {}) {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (page != null) params.set('page', String(page));
    if (limit != null) params.set('limit', String(limit));
    const query = params.toString();
    return this._request(`/entries${query ? `?${query}` : ''}`, {
      headers: this.getAuthHeaders()
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
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ 
        profile: this.state.profile, 
        settings: this.state.settings, 
        theme: this.state.theme,
        signOffs: this.state.signOffs || {}
      })
    }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    this.state.profile = { ...DEFAULT_STATE.profile, ...savedConfig.profile };
    this.state.settings = { ...DEFAULT_STATE.settings, ...savedConfig.settings };
    this.state.theme = savedConfig.theme || 'dark';
    this.state.signOffs = savedConfig.signOffs || {};
    document.body.className = this.state.theme === 'light' ? 'light-theme' : '';

    await this.refreshHolidays([], { force: true }).catch(err => {
      console.error('[Store] Failed to refresh holidays after config update:', err);
      return null;
    });

    this._markResourcesChanged(['config']);
    this._notify({ resources: ['config'] });
  }

  // --- Sign-Offs ---
  async signOffMonth(monthKey, supervisor, remarks = '') {
    return signOffMonth(this, monthKey, supervisor, remarks);
  }

  async retractMonthSignOff(monthKey) {
    return retractMonthSignOff(this, monthKey);
  }

  getMonthSignOff(monthKey) {
    return getMonthSignOff(this, monthKey);
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
      headers: this.getAuthHeaders()
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
    await this._request(`/holidays/${date}`, { method: 'DELETE', headers: this.getAuthHeaders() }, { logoutOn401: true }).catch(err => {
      this._consumeLocalSyncSkip();
      throw err;
    });
    this.state.holidays = this.state.holidays.filter(h => h.date !== date); 
    this._markResourcesChanged(['holidays']);
    this._notify({ resources: ['holidays'] });
  }

  async restoreHoliday(snapshot) {
    return restoreHoliday(this, snapshot);
  }

  async restoreConfig(snapshot) {
    return restoreConfig(this, snapshot);
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
    this.summaryStatsCache = computeSummaryStats(this.state.entries, normalizeEntryStatus);
    this.summaryStatsCacheVersion = entriesVersion;
    return this.summaryStatsCache;
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
    const cacheKey = `${this.getResourceVersion('entries')}:${this.getResourceVersion('holidays')}:${year ?? ''}:${month ?? ''}`;
    const cached = this.statusSummaryCache.get(cacheKey);
    if (cached) return cached;

    const entries = year != null ? this.getEntriesByMonth(year, month) : this.state.entries;
    const holidays = year != null ? this.getHolidaysInMonth(year, month) : this.state.holidays;
    const summary = computeStatusSummary({
      entries,
      holidays,
      normalizeEntryStatus,
      getEntryByDate: (date) => this.getEntryByDate(date),
    });

    this.statusSummaryCache.set(cacheKey, summary);
    return summary;
  }

  getAttendanceSummary(year, month) {
    const cacheKey = `${this.getResourceVersion('entries')}:${this.getResourceVersion('holidays')}:${year ?? ''}:${month ?? ''}`;
    const cached = this.attendanceCache.get(cacheKey);
    if (cached) return cached;

    const entries = year != null ? this.getEntriesByMonth(year, month) : this.state.entries;
    const statusSummary = this.getStatusSummary(year, month);
    const attendance = computeAttendanceSummary({
      entries,
      normalizeEntryStatus,
      statusSummary,
    });
    this.attendanceCache.set(cacheKey, attendance);
    return attendance;
  }

  getCompletionEstimate() {
    return computeCompletionEstimate(this.getCompletionForecast());
  }

  getCompletionForecast(today = toLocalDateString(new Date())) {
    const cacheKey = `${this.getResourceVersion('entries')}:${this.getResourceVersion('holidays')}:${this.getResourceVersion('config')}:${today}`;
    if (this.forecastCacheKey === cacheKey) {
      return this.forecastCache;
    }
    const forecast = this._computeCompletionForecast(today);
    this.forecastCache = forecast;
    this.forecastCacheKey = cacheKey;
    return forecast;
  }

  _computeCompletionForecast(today) {
    return computeCompletionForecast({
      today,
      requiredHours: this.getRequiredHours(),
      entries: this.state.entries,
      holidays: this.state.holidays,
      resolveStatus: normalizeEntryStatus,
      isWorkday: isWeekday,
      isExcluded: status => NON_WORKING_STATUSES.has(status) && status !== 'absent',
    });
  }

  getCurrentWeekHours(now = new Date()) {
    const entriesVersion = this.getResourceVersion('entries');
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const cacheKey = `${entriesVersion}:${mondayStr}`;
    if (this.currentWeekHoursCacheKey === cacheKey && this.currentWeekHoursCache !== null) {
      return this.currentWeekHoursCache;
    }
    this.currentWeekHoursCache = computeCurrentWeekHours(this.state.entries, normalizeEntryStatus, now);
    this.currentWeekHoursCacheKey = cacheKey;
    return this.currentWeekHoursCache;
  }

  getDataQualityAlerts() {
    const entriesVersion = this.getResourceVersion('entries');
    if (this.alertsCacheVersion === entriesVersion) {
      return this.alertsCache;
    }
    const alerts = computeDataQualityAlerts(this.getAllEntriesWithDerivedStatus());
    this.alertsCache = alerts;
    this.alertsCacheVersion = entriesVersion;
    return alerts;
  }

  getActivityTemplates() {
    return getActivityTemplates();
  }

  saveActivityTemplate(template) {
    return saveActivityTemplate(template);
  }

  deleteActivityTemplate(id) {
    return deleteActivityTemplate(id);
  }

  async applyTemplateToDates(templateId, dates = [], options = {}) {
    return applyTemplateToDates(this, templateId, dates, options);
  }

  findPreviousWorkingEntry(date) {
    return findPreviousWorkingEntry(this, date);
  }

  async reusePreviousWorkingDay(date, options = {}) {
    return reusePreviousWorkingDay(this, date, options);
  }

  async batchUpdateStatuses(dates = [], status, options = {}) {
    return batchUpdateStatuses(this, dates, status, options);
  }

  getSummaryPack({ dateFrom, dateTo } = {}) {
    const cacheKey = `${this.getResourceVersion('entries')}:${dateFrom || ''}:${dateTo || ''}`;
    if (this.summaryPackCacheKey === cacheKey && this.summaryPackCache) {
      return this.summaryPackCache;
    }
    const pack = computeSummaryPack({
      entriesWithDerivedStatus: this.getAllEntriesWithDerivedStatus(),
      dateFrom,
      dateTo,
    });
    this.summaryPackCache = pack;
    this.summaryPackCacheKey = cacheKey;
    return pack;
  }

  // --- Data Management ---
  exportData() {
    return exportData(this);
  }

  async previewImport(json) {
    return previewImport(this, json);
  }

  async importData(json) {
    return importData(this, json);
  }

  async restoreEntry(snapshot) {
    return restoreEntry(this, snapshot);
  }

  async restoreStateSnapshot(snapshot) {
    return restoreStateSnapshot(this, snapshot);
  }

  async forceDeleteEntry(id) {
    return this.deleteEntry(id, { force: true });
  }

  async clearAllData() {
    return clearAllData(this, DEFAULT_STATE);
  }
}

export const store = new Store();
