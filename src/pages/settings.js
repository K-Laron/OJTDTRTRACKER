import { store } from '../store.js';
import { toast, confirmDialog, ICONS } from '../utils.js';

export function render() {
  const p = store.state.profile;
  const s = store.state.settings;
  const theme = store.state.theme;

  return `
    <div class="page-header"><div><h2>Settings</h2><p>Configure your profile and tracker preferences</p></div></div>

    <!-- Profile -->
    <div class="card mb-6">
      <div class="card-header"><h3>Profile Information</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Full Name</label><input type="text" id="set-name" value="${p.name}" placeholder="Your full name"></div>
        <div class="form-group"><label>Position</label><input type="text" id="set-position" value="${p.position}" placeholder="OJT Trainee"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Department</label><input type="text" id="set-dept" value="${p.department}" placeholder="Department/Office"></div>
        <div class="form-group"><label>School</label><input type="text" id="set-school" value="${p.school}" placeholder="School/University"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Supervisor</label><input type="text" id="set-supervisor" value="${p.supervisor}" placeholder="Supervisor's name"></div>
        <div class="form-group"><label>Start Date</label><input type="date" id="set-start" value="${p.startDate}"></div>
      </div>
      <div class="mt-4"><button class="btn btn-primary" id="btn-save-profile">${ICONS.check} Save Profile</button></div>
    </div>

    <!-- OJT Settings -->
    <div class="card mb-6">
      <div class="card-header"><h3>OJT Settings</h3></div>
      <div class="form-row-3">
        <div class="form-group"><label>Required Hours</label><input type="number" id="set-hours" value="${s.requiredHours}" min="1"></div>
        <div class="form-group"><label>Weekly Target (hours)</label><input type="number" id="set-weekly" value="${s.weeklyTarget}" min="1" max="80"></div>
        <div class="form-group"><label>Break Duration (min)</label><input type="number" id="set-break" value="${s.breakDuration}" min="0" max="120"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Expected Time In</label><input type="time" id="set-timein" value="${s.expectedTimeIn}"></div>
        <div class="form-group"><label>Expected Time Out</label><input type="time" id="set-timeout" value="${s.expectedTimeOut}"></div>
      </div>
      <div class="form-group mt-4"><label>Time Format Display</label>
        <div class="form-row">
          <button class="btn ${s.timeFormat === '12h' || !s.timeFormat ? 'btn-primary' : 'btn-secondary'}" id="format-12h">12-hour (1:00 PM)</button>
          <button class="btn ${s.timeFormat === '24h' ? 'btn-primary' : 'btn-secondary'}" id="format-24h">24-hour (13:00)</button>
        </div>
      </div>
      <div class="mt-4"><button class="btn btn-primary" id="btn-save-settings">${ICONS.check} Save Settings</button></div>
    </div>

    <!-- Appearance -->
    <div class="card mb-6">
      <div class="card-header"><h3>Appearance</h3></div>
      <div class="form-group"><label>Theme</label>
        <div class="form-row">
          <button class="btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" id="theme-dark">🌙 Dark</button>
          <button class="btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}" id="theme-light">☀️ Light</button>
        </div>
      </div>
    </div>

    <!-- Notifications -->
    <div class="card mb-6">
      <div class="card-header"><h3>Notifications</h3></div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="set-notif" ${s.notificationsEnabled ? 'checked' : ''}> Enable browser notifications
        </label>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Clock-In Reminder</label><input type="time" id="set-notif-in" value="${s.clockInReminder}" ${!s.notificationsEnabled ? 'disabled' : ''}></div>
        <div class="form-group"><label>Clock-Out Reminder</label><input type="time" id="set-notif-out" value="${s.clockOutReminder}" ${!s.notificationsEnabled ? 'disabled' : ''}></div>
      </div>
      <div class="mt-4"><button class="btn btn-primary" id="btn-save-notif">${ICONS.check} Save Notification Settings</button></div>
    </div>

    <!-- Auto-backup -->
    <div class="card mb-6">
      <div class="card-header"><h3>Auto-backup</h3></div>
      <div class="form-group"><label>Backup Frequency</label>
        <select id="set-backup">
          <option value="off" ${s.autoBackup === 'off' ? 'selected' : ''}>Off</option>
          <option value="weekly" ${s.autoBackup === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="monthly" ${s.autoBackup === 'monthly' ? 'selected' : ''}>Monthly</option>
        </select>
      </div>
      <p class="text-muted" style="font-size:0.85rem">${s.lastBackupDate ? `Last backup: ${new Date(s.lastBackupDate).toLocaleDateString()}` : 'No backups yet'}</p>
      <div class="mt-4"><button class="btn btn-primary" id="btn-save-backup">${ICONS.check} Save</button></div>
    </div>

    <!-- Data Management -->
    <div class="card">
      <div class="card-header"><h3>Data Management</h3></div>
      <p class="text-muted mb-4" style="font-size:0.9rem">All data is stored locally in your browser.</p>
      <div class="flex gap-4" style="flex-wrap:wrap">
        <button class="btn btn-secondary" id="btn-export-data">${ICONS.download} Export JSON</button>
        <label class="btn btn-secondary" style="cursor:pointer">${ICONS.upload} Import Data<input type="file" id="btn-import-data" accept=".json" style="display:none"></label>
        <button class="btn btn-danger" id="btn-clear-data">${ICONS.trash} Clear All Data</button>
      </div>
    </div>
  `;
}

export function mount() {
  document.getElementById('btn-save-profile')?.addEventListener('click', () => {
    store.updateProfile({ name: document.getElementById('set-name').value.trim(), position: document.getElementById('set-position').value.trim(), department: document.getElementById('set-dept').value.trim(), school: document.getElementById('set-school').value.trim(), supervisor: document.getElementById('set-supervisor').value.trim(), startDate: document.getElementById('set-start').value });
    toast('Profile saved!', 'success');
  });
  document.getElementById('btn-save-settings')?.addEventListener('click', () => {
    store.updateSettings({ requiredHours: parseInt(document.getElementById('set-hours').value) || 486, weeklyTarget: parseInt(document.getElementById('set-weekly').value) || 40, breakDuration: parseInt(document.getElementById('set-break').value) || 60, expectedTimeIn: document.getElementById('set-timein').value || '08:00', expectedTimeOut: document.getElementById('set-timeout').value || '17:00' });
    toast('Settings saved!', 'success');
  });
  // Time Format
  document.getElementById('format-12h')?.addEventListener('click', () => { store.updateSettings({ timeFormat: '12h' }); window.dispatchEvent(new Event('hashchange')); });
  document.getElementById('format-24h')?.addEventListener('click', () => { store.updateSettings({ timeFormat: '24h' }); window.dispatchEvent(new Event('hashchange')); });
  // Theme
  document.getElementById('theme-dark')?.addEventListener('click', () => { store.setTheme('dark'); window.dispatchEvent(new Event('hashchange')); });
  document.getElementById('theme-light')?.addEventListener('click', () => { store.setTheme('light'); window.dispatchEvent(new Event('hashchange')); });
  // Notifications
  document.getElementById('set-notif')?.addEventListener('change', e => {
    const els = [document.getElementById('set-notif-in'), document.getElementById('set-notif-out')];
    els.forEach(el => { if (el) el.disabled = !e.target.checked; });
  });
  document.getElementById('btn-save-notif')?.addEventListener('click', () => {
    const enabled = document.getElementById('set-notif').checked;
    if (enabled && 'Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
    store.updateSettings({ notificationsEnabled: enabled, clockInReminder: document.getElementById('set-notif-in').value, clockOutReminder: document.getElementById('set-notif-out').value });
    toast('Notification settings saved!', 'success');
  });
  // Auto-backup
  document.getElementById('btn-save-backup')?.addEventListener('click', () => {
    store.updateSettings({ autoBackup: document.getElementById('set-backup').value });
    toast('Backup settings saved!', 'success');
  });
  // Data management
  document.getElementById('btn-export-data')?.addEventListener('click', () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ojt-dtr-data.json'; a.click(); URL.revokeObjectURL(url);
    toast('Data exported!', 'success');
  });
  document.getElementById('btn-import-data')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      toast('Importing data...', 'info');
      const success = await store.importData(reader.result);
      if (success) {
        toast('Data imported successfully!', 'success');
        window.dispatchEvent(new Event('hashchange'));
      } else {
        toast('Invalid file or import failed', 'error');
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('btn-clear-data')?.addEventListener('click', async () => {
    if (await confirmDialog('Permanently delete ALL data?')) { store.clearAllData(); toast('Cleared', 'info'); window.dispatchEvent(new Event('hashchange')); }
  });
}
