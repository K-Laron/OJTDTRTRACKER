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

class Store {
  constructor() {
    this.state = structuredClone(DEFAULT_STATE);
    this.listeners = [];
    this.undoStack = [];
    this.userId = localStorage.getItem('dtr_user_id') || null;
    this.username = localStorage.getItem('dtr_username') || null;
    if (this.userId) {
      this.init();
      this.startPolling();
    }
  }

  async init() {
    if (!this.userId) return;
    try {
      const headers = { 'X-User-Id': this.userId };
      const [entries, holidays, config] = await Promise.all([
        fetch(`${API_BASE}/entries`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/holidays`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/config`, { headers }).then(r => r.json())
      ]);

      this.state.entries = entries;
      this.state.holidays = holidays;
      if (config) {
        this.state.profile = { ...DEFAULT_STATE.profile, ...config.profile };
        this.state.settings = { ...DEFAULT_STATE.settings, ...config.settings };
        this.state.theme = config.theme || 'dark';
      }
      
      // Apply theme
      document.body.className = this.state.theme === 'light' ? 'light-theme' : '';
      this._notify();
    } catch (e) {
      console.error('[Store] Failed to load data from server:', e);
    }
  }

  _notify() {
    this.listeners.forEach(fn => fn(this.state));
  }

  startPolling() {
    if (!this.userId || this.evtSource) return;
    this.evtSource = new EventSource(`${API_BASE}/sync?userId=${this.userId}`);
    this.evtSource.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'update') {
        try {
          // Re-fetch data only when the server tells us there's an update
          const headers = { 'X-User-Id': this.userId };
          const [newEntries, newHolidays, newConfig] = await Promise.all([
            fetch(`${API_BASE}/entries`, { headers }).then(r => { if (r.status===401) this.logout(); return r.json(); }),
            fetch(`${API_BASE}/holidays`, { headers }).then(r => r.json()),
            fetch(`${API_BASE}/config`, { headers }).then(r => r.json())
          ]);

          const entriesChanged = JSON.stringify(this.state.entries) !== JSON.stringify(newEntries);
          const holidaysChanged = JSON.stringify(this.state.holidays) !== JSON.stringify(newHolidays);
          const configChanged = JSON.stringify(this.state.settings) !== JSON.stringify(newConfig.settings);
          const profileChanged = JSON.stringify(this.state.profile) !== JSON.stringify(newConfig.profile);
          const themeChanged = this.state.theme !== (newConfig.theme || 'dark');

          if (entriesChanged || holidaysChanged || configChanged || profileChanged || themeChanged) {
            this.state.entries = newEntries;
            this.state.holidays = newHolidays;
            if (newConfig) {
              this.state.profile = { ...DEFAULT_STATE.profile, ...newConfig.profile };
              this.state.settings = { ...DEFAULT_STATE.settings, ...newConfig.settings };
              const oldTheme = this.state.theme;
              this.state.theme = newConfig.theme || 'dark';
              if (oldTheme !== this.state.theme) {
                document.body.className = this.state.theme === 'light' ? 'light-theme' : '';
              }
            }
            this._notify();

            // Only trigger a frontend visual refresh if the user isn't actively typing in a popup modal
            if (!document.querySelector('.modal-overlay')) {
              window.dispatchEvent(new Event('hashchange'));
            }
          }
        } catch (err) {
          console.error('Real-time sync error:', err);
        }
      }
    };
  }


  subscribe(fn) { 
    this.listeners.push(fn); 
    return () => { this.listeners = this.listeners.filter(l => l !== fn); }; 
  }

  // --- Auth ---
  async login(username, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    this._setAuth(data.userId, data.username);
  }

  async register(username, password) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    this._setAuth(data.userId, data.username);
  }

  _setAuth(id, name) {
    this.userId = id;
    this.username = name;
    localStorage.setItem('dtr_user_id', id);
    localStorage.setItem('dtr_username', name);
    this.init();
    this.startPolling();
    this._notify();
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
    this._notify();
    window.dispatchEvent(new Event('hashchange'));
  }

  // --- Entries CRUD ---
  async addEntry(entry) {
    entry.id = crypto.randomUUID();
    entry.createdAt = new Date().toISOString();
    
    const res = await fetch(`${API_BASE}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(entry)
    });
    const newEntry = await res.json();
    
    this.state.entries.push(newEntry);
    this._notify();
    return newEntry;
  }

  async updateEntry(id, updates) {
    const i = this.state.entries.findIndex(e => e.id === id);
    if (i === -1) return null;
    this._pushUndo('update', structuredClone(this.state.entries[i]));
    
    const res = await fetch(`${API_BASE}/entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify(updates)
    });
    const updatedEntry = await res.json();
    
    this.state.entries[i] = updatedEntry;
    this._notify();
    return updatedEntry;
  }

  async deleteEntry(id) {
    const entry = this.state.entries.find(e => e.id === id);
    if (entry) this._pushUndo('delete', structuredClone(entry));
    
    await fetch(`${API_BASE}/entries/${id}`, { method: 'DELETE', headers: { 'X-User-Id': this.userId } });
    
    this.state.entries = this.state.entries.filter(e => e.id !== id);
    this._notify();
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
    return this.state.entries
      .filter(e => { const d = new Date(e.date); return d.getFullYear() === year && d.getMonth() === month; })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getAllEntries() { return [...this.state.entries].sort((a, b) => b.date.localeCompare(a.date)); }

  // --- Profile & Settings ---
  async updateProfile(p) { 
    this.state.profile = { ...this.state.profile, ...p }; 
    await this._saveConfig();
  }
  
  async updateSettings(s) { 
    this.state.settings = { ...this.state.settings, ...s }; 
    await this._saveConfig();
  }

  async _saveConfig() {
    await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
      body: JSON.stringify({ 
        profile: this.state.profile, 
        settings: this.state.settings, 
        theme: this.state.theme 
      })
    });
    this._notify();
  }

  // --- Holidays ---
  async addHoliday(h) {
    if (!this.state.holidays.find(x => x.date === h.date)) {
      const res = await fetch(`${API_BASE}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify(h)
      });
      const newHol = await res.json();
      this.state.holidays.push(newHol);
      this._notify();
    }
  }

  async removeHoliday(date) { 
    await fetch(`${API_BASE}/holidays/${date}`, { method: 'DELETE', headers: { 'X-User-Id': this.userId } });
    this.state.holidays = this.state.holidays.filter(h => h.date !== date); 
    this._notify();
  }

  getHolidaysInMonth(y, m) {
    return this.state.holidays.filter(h => { const d = new Date(h.date); return d.getFullYear() === y && d.getMonth() === m; });
  }
  isHoliday(date) { return this.state.holidays.find(h => h.date === date) || null; }

  // --- Theme ---
  async setTheme(t) { 
    this.state.theme = t; 
    document.body.className = t === 'light' ? 'light-theme' : ''; 
    await this._saveConfig();
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
  getTotalHours() { return this.state.entries.reduce((s, e) => s + (parseFloat(e.hoursRendered) || 0), 0); }
  getTotalOvertime() { return this.state.entries.reduce((s, e) => s + (parseFloat(e.overtimeHours) || 0), 0); }
  getTotalLateMinutes() { return this.state.entries.reduce((s, e) => s + (parseInt(e.lateMinutes) || 0), 0); }
  getTotalUndertimeMinutes() { return this.state.entries.reduce((s, e) => s + (parseInt(e.undertimeMinutes) || 0), 0); }
  getRequiredHours() { return this.state.settings.requiredHours; }
  getRemainingHours() { return Math.max(0, this.getRequiredHours() - this.getTotalHours()); }
  getProgress() { const r = this.getRequiredHours(); return r === 0 ? 0 : Math.min(100, (this.getTotalHours() / r) * 100); }
  getDaysAttended() { return new Set(this.state.entries.filter(e => e.amTimeOut || e.pmTimeOut).map(e => e.date)).size; }

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
    return { avgPerDay, daysNeeded, estimatedDate: estDate.toISOString().split('T')[0] };
  }

  getCurrentWeekHours() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const mondayStr = monday.toISOString().split('T')[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];
    return this.state.entries
      .filter(e => e.date >= mondayStr && e.date <= sundayStr)
      .reduce((s, e) => s + (parseFloat(e.hoursRendered) || 0), 0);
  }

  // --- Data Management ---
  exportData() { return JSON.stringify(this.state, null, 2); }
  async importData(json) {
    try {
      const data = JSON.parse(json);
      const res = await fetch(`${API_BASE}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      
      // Refresh local state
      await this.init();
      return true;
    } catch (err) {
      console.error('Import failed:', err);
      return false;
    }
  }

  async clearAllData() {
    try {
      await fetch(`${API_BASE}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': this.userId },
        body: JSON.stringify(DEFAULT_STATE)
      });
      this.state = structuredClone(DEFAULT_STATE);
      this._notify();
    } catch (err) {
      console.error('Clear data failed:', err);
    }
  }
}

export const store = new Store();
