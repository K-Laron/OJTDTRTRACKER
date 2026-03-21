import { store } from '../store.js';
import { closeModal, fmtDate, fmtHours, fmtMinutes, fmtTimeStr, MONTHS, openModal, toast, ICONS, requestRender } from '../utils.js';

let activeTab = 'overview';
let auditEvents = [];
let auditLoading = false;
let auditError = '';
let auditLoaded = false;

function formatAuditTimestamp(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
}

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthlyData() {
  const months = {};
  store.state.entries.forEach(e => {
    if (!e.amTimeOut && !e.pmTimeOut) return;
    const key = e.date.slice(0, 7);
    if (!months[key]) months[key] = { hours: 0, ot: 0, late: 0, undertime: 0, days: 0 };
    months[key].hours += e.hoursRendered || 0;
    months[key].ot += e.overtimeHours || 0;
    months[key].late += e.lateMinutes || 0;
    months[key].undertime += e.undertimeMinutes || 0;
    months[key].days++;
  });
  return months;
}

function getWeeklyData() {
  const weeks = {};
  store.state.entries.forEach(e => {
    if (!e.amTimeOut && !e.pmTimeOut) return;
    const d = new Date(e.date + 'T00:00:00');
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    const key = toLocalDateString(start);
    if (!weeks[key]) weeks[key] = { hours: 0, days: 0 };
    weeks[key].hours += e.hoursRendered || 0;
    weeks[key].days++;
  });
  return weeks;
}

function renderOverview() {
  const totalHrs = store.getTotalHours();
  const totalOT = store.getTotalOvertime();
  const totalLate = store.getTotalLateMinutes();
  const totalUT = store.getTotalUndertimeMinutes();
  const days = store.getDaysAttended();
  const avgHrs = days > 0 ? totalHrs / days : 0;

  return `
    <div class="card-grid card-grid-3 mb-6">
      <div class="stat-card primary"><div class="stat-label">Total Hours</div><div class="stat-value">${totalHrs.toFixed(1)}h</div></div>
      <div class="stat-card accent"><div class="stat-label">Avg Hours/Day</div><div class="stat-value">${avgHrs.toFixed(1)}h</div></div>
      <div class="stat-card info"><div class="stat-label">Days Attended</div><div class="stat-value">${days}</div></div>
    </div>
    <div class="card-grid card-grid-2 mb-6">
      <div class="card">
        <div class="card-header"><h3>Time Summary</h3></div>
        <div class="progress-details">
          <div class="detail-row"><span class="detail-label">Total Overtime</span><span class="detail-value text-warning">${fmtHours(totalOT)}</span></div>
          <div class="detail-row"><span class="detail-label">Total Late</span><span class="detail-value text-danger">${fmtMinutes(totalLate)}</span></div>
          <div class="detail-row"><span class="detail-label">Total Undertime</span><span class="detail-value text-danger">${fmtMinutes(totalUT)}</span></div>
        </div>
      </div>
    </div>
  `;
}

function renderMonthly() {
  const data = getMonthlyData();
  const keys = Object.keys(data).sort();
  if (!keys.length) return '<div class="card"><div class="empty-state"><h4>No monthly data yet</h4></div></div>';

  const maxHrs = Math.max(...keys.map(k => data[k].hours), 1);

  return `
    <div class="card mb-6">
      <div class="card-header"><h3>Monthly Hours</h3></div>
      <div class="bar-chart">
        ${keys.map(k => {
          const pct = (data[k].hours / maxHrs) * 100;
          const [y, m] = k.split('-');
          return `<div class="bar-col">
            <div class="bar-value">${data[k].hours.toFixed(0)}h</div>
            <div class="bar" style="height:${Math.max(pct, 2)}%"></div>
            <div class="bar-label">${MONTHS[parseInt(m) - 1]?.slice(0, 3)} ${y.slice(2)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Monthly Breakdown</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Days</th><th>Hours</th><th>Overtime</th><th>Late</th><th>Undertime</th></tr></thead>
          <tbody>
            ${keys.map(k => `<tr>
              <td>${MONTHS[parseInt(k.split('-')[1]) - 1]} ${k.split('-')[0]}</td>
              <td>${data[k].days}</td>
              <td class="font-mono">${data[k].hours.toFixed(1)}h</td>
              <td class="font-mono">${fmtHours(data[k].ot)}</td>
              <td class="font-mono">${fmtMinutes(data[k].late)}</td>
              <td class="font-mono">${fmtMinutes(data[k].undertime)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderWeekly() {
  const data = getWeeklyData();
  const keys = Object.keys(data).sort().slice(-12);
  if (!keys.length) return '<div class="card"><div class="empty-state"><h4>No weekly data yet</h4></div></div>';

  const maxHrs = Math.max(...keys.map(k => data[k].hours), 1);

  return `
    <div class="card">
      <div class="card-header"><h3>Weekly Hours (Last 12 Weeks)</h3></div>
      <div class="bar-chart">
        ${keys.map(k => {
          const pct = (data[k].hours / maxHrs) * 100;
          const d = new Date(k + 'T00:00:00');
          const label = `${d.getMonth() + 1}/${d.getDate()}`;
          return `<div class="bar-col">
            <div class="bar-value">${data[k].hours.toFixed(0)}h</div>
            <div class="bar" style="height:${Math.max(pct, 2)}%"></div>
            <div class="bar-label">${label}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderActivity() {
  if (auditLoading) {
    return '<div class="card"><div class="empty-state"><h4>Loading activity...</h4></div></div>';
  }

  if (auditError) {
    return `<div class="card"><div class="empty-state"><h4>Activity unavailable</h4><p>${auditError}</p></div></div>`;
  }

  if (!auditEvents.length) {
    return '<div class="card"><div class="empty-state"><h4>No activity yet</h4><p>Changes will appear here as you use the tracker.</p></div></div>';
  }

  return `
    <div class="card">
      <div class="card-header"><h3>Recent Activity</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Details</th><th>Actions</th></tr></thead>
          <tbody>
            ${auditEvents.map((event, index) => `<tr>
              <td>${formatAuditTimestamp(event.ts)}</td>
              <td>${event.entity || '--'}</td>
              <td>${event.action || '--'}</td>
              <td>${getAuditDetails(event)}</td>
              <td>
                <div class="table-actions">
                  <button class="btn-icon btn-audit-view" data-index="${index}" title="View">${ICONS.document}</button>
                  ${getQuickRestoreVersion(event) ? `<button class="btn-icon btn-audit-restore" data-index="${index}" title="Restore">${ICONS.clock}</button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getAuditDetails(event) {
  if (event.after?.date) return event.after.date;
  if (event.before?.date) return event.before.date;
  if (Array.isArray(event.after?.entries)) return `${event.after.entries.length} entries / ${event.after.holidays.length} holidays`;
  if (Array.isArray(event.before?.entries)) return `${event.before.entries.length} entries / ${event.before.holidays.length} holidays`;
  if (event.after?.profile || event.before?.profile) return event.after?.profile?.name || event.before?.profile?.name || 'Config change';
  if (event.meta?.mergedFields?.length) return `Merged fields: ${event.meta.mergedFields.join(', ')}`;
  return '--';
}

function getQuickRestoreVersion(event) {
  if (getVersionSnapshot(event, 'after')) return 'after';
  if (getVersionSnapshot(event, 'before')) return 'before';
  return null;
}

function getVersionSnapshot(event, version) {
  return event?.[version] || null;
}

function canRestoreVersion(event, version) {
  const snapshot = getVersionSnapshot(event, version);
  if (!snapshot) return false;
  return ['entry', 'holiday', 'config', 'import'].includes(event.entity);
}

function renderSnapshotBlock(label, snapshot, entity) {
  return `
    <div class="card" style="margin-top:12px">
      <div class="card-header"><h3>${label}</h3></div>
      ${snapshot ? renderSnapshotDetails(snapshot, entity) : '<div class="empty-state"><p>No snapshot</p></div>'}
    </div>
  `;
}

function renderSnapshotDetails(snapshot, entity) {
  if (entity === 'entry') {
    return `
      <div class="progress-details">
        <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${fmtDate(snapshot.date)}</span></div>
        <div class="detail-row"><span class="detail-label">AM</span><span class="detail-value">${fmtTimeStr(snapshot.amTimeIn)} - ${fmtTimeStr(snapshot.amTimeOut)}</span></div>
        <div class="detail-row"><span class="detail-label">PM</span><span class="detail-value">${fmtTimeStr(snapshot.pmTimeIn)} - ${fmtTimeStr(snapshot.pmTimeOut)}</span></div>
        <div class="detail-row"><span class="detail-label">Hours</span><span class="detail-value">${snapshot.hoursRendered != null ? fmtHours(snapshot.hoursRendered) : '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Activities</span><span class="detail-value">${snapshot.activities || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Remarks</span><span class="detail-value">${snapshot.remarks || '--'}</span></div>
      </div>
    `;
  }

  if (entity === 'holiday') {
    return `
      <div class="progress-details">
        <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${fmtDate(snapshot.date)}</span></div>
        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${snapshot.name}</span></div>
        <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${snapshot.type}</span></div>
      </div>
    `;
  }

  if (entity === 'config') {
    return `
      <div class="progress-details">
        <div class="detail-row"><span class="detail-label">Profile</span><span class="detail-value">${snapshot.profile?.name || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Theme</span><span class="detail-value">${snapshot.theme || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Expected Time In</span><span class="detail-value">${snapshot.settings?.expectedTimeIn || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Expected Time Out</span><span class="detail-value">${snapshot.settings?.expectedTimeOut || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Required Hours</span><span class="detail-value">${snapshot.settings?.requiredHours ?? '--'}</span></div>
      </div>
    `;
  }

  if (entity === 'import') {
    return `
      <div class="progress-details">
        <div class="detail-row"><span class="detail-label">Entries</span><span class="detail-value">${snapshot.entries?.length ?? 0}</span></div>
        <div class="detail-row"><span class="detail-label">Holidays</span><span class="detail-value">${snapshot.holidays?.length ?? 0}</span></div>
        <div class="detail-row"><span class="detail-label">Profile</span><span class="detail-value">${snapshot.profile?.name || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Theme</span><span class="detail-value">${snapshot.theme || '--'}</span></div>
      </div>
    `;
  }

  return `<pre style="white-space:pre-wrap">${JSON.stringify(snapshot, null, 2)}</pre>`;
}

async function restoreAuditVersion(event, version) {
  const snapshot = getVersionSnapshot(event, version);
  if (!snapshot) throw new Error('No snapshot available to restore');

  if (event.entity === 'entry') {
    await store.restoreEntry(snapshot);
    return;
  }
  if (event.entity === 'holiday') {
    await store.restoreHoliday(snapshot);
    return;
  }
  if (event.entity === 'config') {
    await store.restoreConfig(snapshot);
    return;
  }
  if (event.entity === 'import') {
    await store.restoreStateSnapshot(snapshot);
    return;
  }

  throw new Error('Unsupported audit restore target');
}

function renderAuditPreview(event) {
  return `
    <div class="modal-header">
      <h3>Activity Details</h3>
      <button class="btn-icon modal-close-btn">${ICONS.x}</button>
    </div>
    <div class="modal-body">
      <div class="progress-details">
        <div class="detail-row"><span class="detail-label">When</span><span class="detail-value">${formatAuditTimestamp(event.ts)}</span></div>
        <div class="detail-row"><span class="detail-label">Entity</span><span class="detail-value">${event.entity || '--'}</span></div>
        <div class="detail-row"><span class="detail-label">Action</span><span class="detail-value">${event.action || '--'}</span></div>
        ${event.meta?.mergedFields?.length ? `<div class="detail-row"><span class="detail-label">Merged Fields</span><span class="detail-value">${event.meta.mergedFields.join(', ')}</span></div>` : ''}
        ${typeof event.meta?.transactional === 'boolean' ? `<div class="detail-row"><span class="detail-label">Transactional</span><span class="detail-value">${event.meta.transactional ? 'Yes' : 'No'}</span></div>` : ''}
      </div>
      ${renderSnapshotBlock('Before', event.before, event.entity)}
      ${renderSnapshotBlock('After', event.after, event.entity)}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost modal-cancel-btn">Close</button>
      ${canRestoreVersion(event, 'before') ? `<button class="btn btn-secondary" id="audit-restore-before">Restore Before</button>` : ''}
      ${canRestoreVersion(event, 'after') ? `<button class="btn btn-primary" id="audit-restore-after">Restore After</button>` : ''}
    </div>
  `;
}

async function loadAuditEvents() {
  auditLoading = true;
  auditLoaded = false;
  auditError = '';
  try {
    const res = await fetch('/api/audit?limit=50', {
      headers: { 'X-User-Id': store.userId }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to load activity');
    auditEvents = Array.isArray(data) ? data : [];
  } catch (err) {
    auditError = err.message || 'Failed to load activity';
  } finally {
    auditLoading = false;
    auditLoaded = true;
    requestRender();
  }
}

export function render() {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'activity', label: 'Activity' },
  ];

  let tabContent = '';
  if (activeTab === 'overview') tabContent = renderOverview();
  else if (activeTab === 'monthly') tabContent = renderMonthly();
  else if (activeTab === 'weekly') tabContent = renderWeekly();
  else if (activeTab === 'activity') tabContent = renderActivity();

  return `
    <div class="page-header">
      <div><h2>Reports</h2><p>Analytics and summaries of your OJT attendance</p></div>
    </div>
    <div class="tabs no-print">
      ${tabs.map(t => `<button class="tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div id="tab-content">${tabContent}</div>
  `;
}

export function mount() {
  if (activeTab === 'activity' && !auditLoaded && !auditLoading) {
    loadAuditEvents();
  }
  document.querySelectorAll('.btn-audit-view').forEach(btn => {
    btn.addEventListener('click', () => {
      const event = auditEvents[Number(btn.dataset.index)];
      if (!event) return;
      openModal(renderAuditPreview(event));
      document.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
      document.querySelector('.modal-cancel-btn')?.addEventListener('click', closeModal);
      document.getElementById('audit-restore-before')?.addEventListener('click', async () => {
        try {
          await restoreAuditVersion(event, 'before');
          closeModal();
          auditLoaded = false;
          toast('Snapshot restored from activity log', 'success');
          loadAuditEvents();
        } catch (err) {
          toast(err.message || 'Failed to restore snapshot', 'error');
        }
      });
      document.getElementById('audit-restore-after')?.addEventListener('click', async () => {
        try {
          await restoreAuditVersion(event, 'after');
          closeModal();
          auditLoaded = false;
          toast('Snapshot restored from activity log', 'success');
          loadAuditEvents();
        } catch (err) {
          toast(err.message || 'Failed to restore snapshot', 'error');
        }
      });
    });
  });
  document.querySelectorAll('.btn-audit-restore').forEach(btn => {
    btn.addEventListener('click', async () => {
      const event = auditEvents[Number(btn.dataset.index)];
      if (!event) return;
      try {
        await restoreAuditVersion(event, getQuickRestoreVersion(event));
        auditLoaded = false;
        toast('Snapshot restored from activity log', 'success');
        loadAuditEvents();
      } catch (err) {
        toast(err.message || 'Failed to restore snapshot', 'error');
      }
    });
  });
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      if (activeTab === 'activity') auditLoaded = false;
      requestRender();
    });
  });
}
