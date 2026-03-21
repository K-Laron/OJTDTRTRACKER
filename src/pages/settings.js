import { store } from '../store.js';
import { toast, confirmDialog, openModal, closeModal, fmtDate, ICONS } from '../utils.js';

function renderImportPreview(summary) {
  const diff = summary.diff || {};
  return `
    <div class="modal-header">
      <h3>Import Preview</h3>
      <button class="btn-icon modal-close-btn">${ICONS.x}</button>
    </div>
    <div class="modal-body">
      <div class="progress-details">
        <div class="detail-row"><span class="detail-label">Current Entries</span><span class="detail-value">${summary.current.entries}</span></div>
        <div class="detail-row"><span class="detail-label">Incoming Entries</span><span class="detail-value">${summary.incoming.entries}</span></div>
        <div class="detail-row"><span class="detail-label">Current Holidays</span><span class="detail-value">${summary.current.holidays}</span></div>
        <div class="detail-row"><span class="detail-label">Incoming Holidays</span><span class="detail-value">${summary.incoming.holidays}</span></div>
        <div class="detail-row"><span class="detail-label">Current Profile</span><span class="detail-value">${summary.current.profileName || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Incoming Profile</span><span class="detail-value">${summary.incoming.profileName || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Current Theme</span><span class="detail-value">${summary.current.theme}</span></div>
        <div class="detail-row"><span class="detail-label">Incoming Theme</span><span class="detail-value">${summary.incoming.theme}</span></div>
        <div class="detail-row"><span class="detail-label">Date Range</span><span class="detail-value">${summary.incoming.startDate ? `${fmtDate(summary.incoming.startDate)} to ${fmtDate(summary.incoming.endDate)}` : 'No entries'}</span></div>
      </div>
      <div class="progress-details" style="margin-top:16px">
        <div class="detail-row"><span class="detail-label">Entries Added / Changed / Removed</span><span class="detail-value">${diff.entriesAdded || 0} / ${diff.entriesChanged || 0} / ${diff.entriesRemoved || 0}</span></div>
        <div class="detail-row"><span class="detail-label">Holidays Added / Changed / Removed</span><span class="detail-value">${diff.holidaysAdded || 0} / ${diff.holidaysChanged || 0} / ${diff.holidaysRemoved || 0}</span></div>
        <div class="detail-row"><span class="detail-label">Profile Fields Changed</span><span class="detail-value">${diff.changedProfileFields?.length ? diff.changedProfileFields.join(', ') : 'None'}</span></div>
        <div class="detail-row"><span class="detail-label">Settings Changed</span><span class="detail-value">${diff.changedSettingFields?.length ? diff.changedSettingFields.join(', ') : 'None'}</span></div>
      </div>
      <p class="text-muted" style="margin-top:16px">Importing will replace your current entries, holidays, and settings.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="confirm-import">Replace Current Data</button>
    </div>
  `;
}

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
      <p class="text-muted mb-4" style="font-size:0.9rem">Your data is stored in your account and can also be exported as JSON.</p>
      <div class="flex gap-4" style="flex-wrap:wrap">
        <button class="btn btn-secondary" id="btn-export-data">${ICONS.download} Export JSON</button>
        <label class="btn btn-secondary" style="cursor:pointer">${ICONS.upload} Import Data<input type="file" id="btn-import-data" accept=".json" style="display:none"></label>
        <button class="btn btn-danger" id="btn-clear-data">${ICONS.trash} Clear All Data</button>
      </div>
    </div>
  `;
}

export function mount() {
  document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    try {
      await store.updateProfile({ name: document.getElementById('set-name').value.trim(), position: document.getElementById('set-position').value.trim(), department: document.getElementById('set-dept').value.trim(), school: document.getElementById('set-school').value.trim(), supervisor: document.getElementById('set-supervisor').value.trim(), startDate: document.getElementById('set-start').value });
      toast('Profile saved!', 'success');
    } catch (err) {
      toast(err.message || 'Failed to save profile', 'error');
    }
  });
  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    try {
      await store.updateSettings({ requiredHours: parseInt(document.getElementById('set-hours').value) || 486, weeklyTarget: parseInt(document.getElementById('set-weekly').value) || 40, breakDuration: parseInt(document.getElementById('set-break').value) || 60, expectedTimeIn: document.getElementById('set-timein').value || '08:00', expectedTimeOut: document.getElementById('set-timeout').value || '17:00' });
      toast('Settings saved!', 'success');
    } catch (err) {
      toast(err.message || 'Failed to save settings', 'error');
    }
  });
  // Time Format
  document.getElementById('format-12h')?.addEventListener('click', async () => {
    try {
      await store.updateSettings({ timeFormat: '12h' });
    } catch (err) {
      toast(err.message || 'Failed to update time format', 'error');
    }
  });
  document.getElementById('format-24h')?.addEventListener('click', async () => {
    try {
      await store.updateSettings({ timeFormat: '24h' });
    } catch (err) {
      toast(err.message || 'Failed to update time format', 'error');
    }
  });
  // Theme
  document.getElementById('theme-dark')?.addEventListener('click', async () => {
    try {
      await store.setTheme('dark');
    } catch (err) {
      toast(err.message || 'Failed to update theme', 'error');
    }
  });
  document.getElementById('theme-light')?.addEventListener('click', async () => {
    try {
      await store.setTheme('light');
    } catch (err) {
      toast(err.message || 'Failed to update theme', 'error');
    }
  });
  // Notifications
  document.getElementById('set-notif')?.addEventListener('change', e => {
    const els = [document.getElementById('set-notif-in'), document.getElementById('set-notif-out')];
    els.forEach(el => { if (el) el.disabled = !e.target.checked; });
  });
  document.getElementById('btn-save-notif')?.addEventListener('click', async () => {
    try {
      const enabled = document.getElementById('set-notif').checked;
      if (enabled && 'Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
      await store.updateSettings({ notificationsEnabled: enabled, clockInReminder: document.getElementById('set-notif-in').value, clockOutReminder: document.getElementById('set-notif-out').value });
      toast('Notification settings saved!', 'success');
    } catch (err) {
      toast(err.message || 'Failed to save notification settings', 'error');
    }
  });
  // Auto-backup
  document.getElementById('btn-save-backup')?.addEventListener('click', async () => {
    try {
      await store.updateSettings({ autoBackup: document.getElementById('set-backup').value });
      toast('Backup settings saved!', 'success');
    } catch (err) {
      toast(err.message || 'Failed to save backup settings', 'error');
    }
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
      try {
        const raw = reader.result;
        const summary = await store.previewImport(raw);
        openModal(renderImportPreview(summary));
        document.querySelector('.modal-close-btn').onclick = closeModal;
        document.querySelector('.modal-cancel-btn').onclick = closeModal;
        document.getElementById('confirm-import').onclick = async () => {
          toast('Importing data...', 'info');
          const success = await store.importData(raw);
          if (success) {
            closeModal();
            toast('Data imported successfully!', 'success');
          } else {
            toast('Import failed during apply', 'error');
          }
        };
      } catch (err) {
        toast(err.message || 'Invalid file or import failed', 'error');
      }
    };
    reader.onerror = () => toast('Failed to read file', 'error');
    reader.readAsText(file);
    e.target.value = '';
  });
  document.getElementById('btn-clear-data')?.addEventListener('click', async () => {
    if (await confirmDialog('Permanently delete ALL data?')) {
      try {
        await store.clearAllData();
        toast('Cleared', 'info');
      } catch (err) {
        toast(err.message || 'Failed to clear data', 'error');
      }
    }
  });
}
