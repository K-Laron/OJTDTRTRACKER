import { store } from '../store.js';
import { fmtHours, getDayName, getDaysInMonth, MONTHS, ICONS,
  openModal, closeModal, confirmDialog, toast, getCurrentDate, fmtDate, fmtTimeStr, requestRender } from '../utils.js';

let selYear = new Date().getFullYear();
let selMonth = new Date().getMonth();

async function ensureVisibleYearHolidays(force = false) {
  if (!store.userId) return;

  try {
    const holidays = await store.refreshHolidays([selYear], { force });
    if (!Array.isArray(holidays)) return;
  } catch (err) {
    console.error('[Calendar] Failed to refresh holidays for visible year:', err);
  }
}

function getDayStatus(dateStr) {
  const entry = store.state.entries.find(e => e.date === dateStr);
  const holiday = store.isHoliday(dateStr);
  const dayName = getDayName(dateStr);
  const isWeekend = dayName === 'Sat' || dayName === 'Sun';
  const startDate = store.state.profile.startDate;

  if (holiday) return { cls: `cal-${holiday.type === 'holiday' ? 'holiday' : 'leave'}`, label: holiday.name, entry, holiday };
  if (entry && (entry.amTimeOut || entry.pmTimeOut)) {
    const isLate = (entry.lateMinutes || 0) > 0;
    return { cls: isLate ? 'cal-late' : 'cal-present', label: fmtHours(entry.hoursRendered), entry, holiday: null };
  }
  if (entry) return { cls: 'cal-active', label: 'In progress', entry, holiday: null };
  if (isWeekend) return { cls: 'cal-weekend', label: '', entry: null, holiday: null };
  // Weekday, no entry — check if in the past
  const today = getCurrentDate();
  if (startDate && dateStr < startDate) return { cls: '', label: '', entry: null, holiday: null };
  if (dateStr < today) return { cls: 'cal-absent', label: '', entry: null, holiday: null };
  return { cls: '', label: '', entry: null, holiday: null };
}

export function render() {
  const daysInMonth = getDaysInMonth(selYear, selMonth);
  const firstDay = new Date(selYear, selMonth, 1).getDay(); // 0=Sun
  const today = getCurrentDate();

  // Build calendar cells
  let cells = '';
  // Empty cells for padding
  for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell cal-empty"></div>';
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { cls, label } = getDayStatus(dateStr);
    const isToday = dateStr === today;
    cells += `
      <div class="cal-cell ${cls} ${isToday ? 'cal-today' : ''}" data-date="${dateStr}">
        <span class="cal-num">${d}</span>
        ${label ? `<span class="cal-label">${label}</span>` : ''}
      </div>
    `;
  }

  // Attendance summary for this month
  const summary = store.getAttendanceSummary(selYear, selMonth);
  const monthHolidays = store.getHolidaysInMonth(selYear, selMonth);

  return `
    <div class="page-header">
      <div><h2>Calendar</h2><p>${MONTHS[selMonth]} ${selYear}</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="cal-prev">&larr; Prev</button>
        <button class="btn btn-secondary" id="cal-today-btn">Today</button>
        <button class="btn btn-secondary" id="cal-next">Next &rarr;</button>
        <button class="btn btn-primary" id="btn-add-holiday">${ICONS.plus} Add Holiday/Leave</button>
      </div>
    </div>

    <div class="card mb-6">
      <p class="text-muted">Philippine public holidays are synced automatically from a public calendar API. Use Add Holiday/Leave only for extra manual dates.</p>
    </div>

    <!-- Attendance Summary -->
    <div class="card-grid card-grid-4 mb-6">
      <div class="stat-card primary"><div class="stat-label">Present</div><div class="stat-value">${summary.present}</div><div class="stat-sub">days this month</div></div>
      <div class="stat-card warning"><div class="stat-label">Late</div><div class="stat-value">${summary.late}</div><div class="stat-sub">days this month</div></div>
      <div class="stat-card info"><div class="stat-label">Holidays</div><div class="stat-value">${monthHolidays.filter(h => h.type === 'holiday').length}</div><div class="stat-sub">this month</div></div>
      <div class="stat-card accent"><div class="stat-label">On Leave</div><div class="stat-value">${monthHolidays.filter(h => h.type !== 'holiday').length}</div><div class="stat-sub">this month</div></div>
    </div>

    <!-- Calendar Grid -->
    <div class="card mb-6">
      <div class="calendar-grid">
        <div class="cal-header">Sun</div><div class="cal-header">Mon</div><div class="cal-header">Tue</div>
        <div class="cal-header">Wed</div><div class="cal-header">Thu</div><div class="cal-header">Fri</div><div class="cal-header">Sat</div>
        ${cells}
      </div>
    </div>

    <!-- Legend -->
    <div class="card">
      <div class="cal-legend">
        <span><i class="legend-dot" style="background:var(--success)"></i> Present</span>
        <span><i class="legend-dot" style="background:var(--warning)"></i> Late</span>
        <span><i class="legend-dot" style="background:var(--danger)"></i> Absent</span>
        <span><i class="legend-dot" style="background:var(--info)"></i> Holiday</span>
        <span><i class="legend-dot" style="background:var(--primary)"></i> Leave</span>
        <span><i class="legend-dot" style="background:var(--accent)"></i> Active</span>
      </div>

      ${monthHolidays.length ? `
        <div class="mt-4">
          <h4 style="font-size:0.9rem;margin-bottom:8px">Holidays & Leaves this month</h4>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Day</th><th>Name</th><th>Type</th><th>Action</th></tr></thead>
              <tbody>
                ${monthHolidays.map(h => `<tr>
                  <td>${fmtDate(h.date)}</td><td>${getDayName(h.date)}</td>
                  <td>${h.name}</td>
                  <td>${h.type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                  <td><button class="btn-icon btn-rm-holiday" data-date="${h.date}" title="Remove">${ICONS.trash}</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function mount() {
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    selMonth--; if (selMonth < 0) { selMonth = 11; selYear--; }
    void ensureVisibleYearHolidays();
    requestRender();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    selMonth++; if (selMonth > 11) { selMonth = 0; selYear++; }
    void ensureVisibleYearHolidays();
    requestRender();
  });
  document.getElementById('cal-today-btn')?.addEventListener('click', () => {
    selYear = new Date().getFullYear(); selMonth = new Date().getMonth();
    void ensureVisibleYearHolidays();
    requestRender();
  });

  void ensureVisibleYearHolidays(true);

  // Click on day cell to view entry
  document.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const { entry, holiday } = getDayStatus(date);
      let body = `<p style="margin-bottom:12px"><strong>${fmtDate(date)}</strong> (${getDayName(date)})</p>`;
      if (holiday) body += `<p>📅 <strong>${holiday.name}</strong> — ${holiday.type.replace('_',' ')}</p>`;
      if (entry) {
        body += `<table style="width:100%;margin-top:12px">
          <tr><td class="text-muted">AM</td><td class="font-mono">${fmtTimeStr(entry.amTimeIn)} – ${fmtTimeStr(entry.amTimeOut)}</td></tr>
          <tr><td class="text-muted">PM</td><td class="font-mono">${fmtTimeStr(entry.pmTimeIn)} – ${fmtTimeStr(entry.pmTimeOut)}</td></tr>
          <tr><td class="text-muted">Hours</td><td>${fmtHours(entry.hoursRendered)}</td></tr>
          ${entry.activities ? `<tr><td class="text-muted">Activities</td><td>${entry.activities}</td></tr>` : ''}
        </table>`;
      }
      if (!entry && !holiday) body += '<p class="text-muted">No record for this day.</p>';
      openModal(`<div class="modal-header"><h3>Day Details</h3><button class="btn-icon" onclick="document.querySelector('.modal-overlay')?.remove()">${ICONS.x}</button></div><div class="modal-body">${body}</div>`);
    });
  });

  // Add holiday
  document.getElementById('btn-add-holiday')?.addEventListener('click', () => {
    openModal(`
      <div class="modal-header"><h3>Add Holiday / Leave</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Date</label><input type="date" id="hol-date" value="${getCurrentDate()}"></div>
        <div class="form-group"><label>Name</label><input type="text" id="hol-name" placeholder="e.g. New Year's Day"></div>
        <div class="form-group"><label>Type</label>
          <select id="hol-type">
            <option value="holiday">Holiday</option>
            <option value="sick_leave">Sick Leave</option>
            <option value="vacation_leave">Vacation Leave</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="hol-save">Add</button>
      </div>
    `);
    document.querySelector('.modal-close-btn').onclick = closeModal;
    document.querySelector('.modal-cancel-btn').onclick = closeModal;
    document.getElementById('hol-save').onclick = async () => {
      const date = document.getElementById('hol-date').value;
      const name = document.getElementById('hol-name').value.trim();
      const type = document.getElementById('hol-type').value;
      if (!date || !name) { toast('Date and name required', 'error'); return; }
      try {
        await store.addHoliday({ date, name, type });
        toast('Added!', 'success');
        closeModal();
      } catch (err) {
        toast(err.message || 'Failed to add holiday/leave', 'error');
      }
    };
  });

  // Remove holiday
  document.querySelectorAll('.btn-rm-holiday').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dateToRemove = btn.dataset.date;
      if (await confirmDialog('Delete this holiday/leave?')) {
        try {
          await store.removeHoliday(dateToRemove);
          toast('Removed', 'info');
          closeModal();
        } catch (err) {
          toast(err.message || 'Failed to remove holiday/leave', 'error');
        }
      }
    });
  });
}
