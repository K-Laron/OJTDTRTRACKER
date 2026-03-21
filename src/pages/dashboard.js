import { store } from '../store.js';
import { fmtHours, fmtMinutes, fmtDate, getDayName, getCurrentDate, getCurrentTime,
  calculateEntryHours, calculateOvertime, calculateLate, calculateUndertime,
  toast, ICONS, fmtTimeStr } from '../utils.js';

let clockIntervalId = null;

export function render() {
  const progress = store.getProgress();
  const totalHrs = store.getTotalHours();
  const remaining = store.getRemainingHours();
  const overtime = store.getTotalOvertime();
  const days = store.getDaysAttended();
  const recent = store.getAllEntries().slice(0, 5);
  const circumference = 2 * Math.PI * 70;
  const offset = circumference * (1 - progress / 100);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const { phase, entry: todayEntry } = store.getClockPhase(getCurrentDate());
  const phaseLabels = {
    0: { label: 'AM Clock In', btnClass: 'btn-primary', icon: ICONS.clock },
    1: { label: 'AM Clock Out', btnClass: 'btn-danger', icon: ICONS.clock },
    2: { label: 'PM Clock In', btnClass: 'btn-primary', icon: ICONS.clock },
    3: { label: 'PM Clock Out', btnClass: 'btn-danger', icon: ICONS.clock },
    4: { label: 'Done for Today', btnClass: 'btn-success', icon: ICONS.check },
  };
  const p = phaseLabels[phase];
  const statusMsg = phase === 0 ? 'Ready to clock in'
    : phase === 1 ? `AM In: ${fmtTimeStr(todayEntry.amTimeIn)} — waiting for AM out`
    : phase === 2 ? `AM: ${fmtTimeStr(todayEntry.amTimeIn)} – ${fmtTimeStr(todayEntry.amTimeOut)} — ready for PM`
    : phase === 3 ? `PM In: ${fmtTimeStr(todayEntry.pmTimeIn)} — waiting for PM out`
    : `${fmtTimeStr(todayEntry.amTimeIn)} – ${fmtTimeStr(todayEntry.amTimeOut)} | ${fmtTimeStr(todayEntry.pmTimeIn)} – ${fmtTimeStr(todayEntry.pmTimeOut)}`;

  // Completion estimate
  const est = store.getCompletionEstimate();
  const estHtml = est
    ? `<div class="detail-row"><span class="detail-label">Avg Hours/Day</span><span class="detail-value">${est.avgPerDay.toFixed(1)}h</span></div>
       <div class="detail-row"><span class="detail-label">Est. Completion</span><span class="detail-value text-primary">${fmtDate(est.estimatedDate)}</span></div>`
    : `<div class="detail-row"><span class="detail-label">Est. Completion</span><span class="detail-value text-muted">Need data</span></div>`;

  // Weekly progress
  const weekHrs = store.getCurrentWeekHours();
  const weekTarget = store.state.settings.weeklyTarget || 40;
  const weekPct = Math.min(100, (weekHrs / weekTarget) * 100);

  // Attendance summary
  const summary = store.getAttendanceSummary();

  return `
    <div class="page-header">
      <div><h2>Dashboard</h2><p>${dateStr}</p></div>
    </div>

    <!-- Clock Section -->
    <div class="clock-section mb-6">
      <div class="clock-info">
        <div class="clock-time font-mono">${timeStr}</div>
        ${phase > 0 && phase < 4 ? `<div class="active-session"><div class="pulse-dot"></div><span>${statusMsg}</span></div>` : `<div class="clock-date">${statusMsg}</div>`}
      </div>
      <div>${phase < 4 ? `<button class="btn ${p.btnClass} btn-lg" id="btn-clock">${p.icon} ${p.label}</button>` : `<span class="badge badge-success" style="font-size:0.9rem;padding:10px 20px">${ICONS.check} ${p.label}</span>`}</div>
    </div>

    <!-- Progress + Estimate -->
    <div class="card-grid card-grid-2 mb-6">
      <div class="card">
        <div class="progress-ring-wrap">
          <div class="progress-ring-container">
            <svg class="progress-ring" viewBox="0 0 160 160">
              <defs><linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#06d6a0"/></linearGradient></defs>
              <circle class="progress-ring-bg" cx="80" cy="80" r="70"/>
              <circle class="progress-ring-fill" cx="80" cy="80" r="70" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset}"/>
            </svg>
            <div class="progress-ring-center">
              <span class="progress-ring-value">${progress.toFixed(1)}%</span>
              <span class="progress-ring-label">Complete</span>
            </div>
          </div>
          <div class="progress-details">
            <div class="detail-row"><span class="detail-label">Hours Rendered</span><span class="detail-value">${fmtHours(totalHrs)}</span></div>
            <div class="detail-row"><span class="detail-label">Required Hours</span><span class="detail-value">${store.getRequiredHours()}h</span></div>
            <div class="detail-row"><span class="detail-label">Remaining</span><span class="detail-value">${fmtHours(remaining)}</span></div>
            ${estHtml}
          </div>
        </div>
      </div>

      <!-- Weekly + Attendance -->
      <div class="flex flex-col gap-4">
        <div class="card">
          <div class="card-header"><h3>This Week</h3><span class="text-muted" style="font-size:0.8rem">${weekHrs.toFixed(1)}h / ${weekTarget}h</span></div>
          <div class="week-progress"><div class="week-progress-bar" style="width:${weekPct}%"></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Attendance</h3></div>
          <div class="progress-details" style="font-size:0.9rem">
            <div class="detail-row"><span class="detail-label">Present</span><span class="detail-value text-success">${summary.present}</span></div>
            <div class="detail-row"><span class="detail-label">Late</span><span class="detail-value text-warning">${summary.late}</span></div>
            <div class="detail-row"><span class="detail-label">Overtime</span><span class="detail-value text-primary">${fmtHours(overtime)}</span></div>
            <div class="detail-row"><span class="detail-label">On Leave</span><span class="detail-value">${summary.onLeave}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="card-grid card-grid-4 mb-6">
      <div class="stat-card primary"><div class="stat-label">Total Hours</div><div class="stat-value">${totalHrs.toFixed(1)}</div><div class="stat-sub">of ${store.getRequiredHours()}h required</div></div>
      <div class="stat-card accent"><div class="stat-label">Remaining</div><div class="stat-value">${remaining.toFixed(1)}</div><div class="stat-sub">hours left</div></div>
      <div class="stat-card warning"><div class="stat-label">Overtime</div><div class="stat-value">${overtime.toFixed(1)}</div><div class="stat-sub">total OT hours</div></div>
      <div class="stat-card info"><div class="stat-label">Days Attended</div><div class="stat-value">${days}</div><div class="stat-sub">working days</div></div>
    </div>

    <!-- Recent Entries -->
    <div class="card">
      <div class="card-header"><h3>Recent Entries</h3><a href="#/timelog" class="btn btn-ghost btn-sm">View All</a></div>
      ${recent.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Day</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th><th>Hours</th></tr></thead>
          <tbody>${recent.map(e => `<tr>
            <td>${fmtDate(e.date)}</td><td>${getDayName(e.date)}</td>
            <td class="font-mono">${fmtTimeStr(e.amTimeIn)}</td><td class="font-mono">${fmtTimeStr(e.amTimeOut)}</td>
            <td class="font-mono">${fmtTimeStr(e.pmTimeIn)}</td><td class="font-mono">${fmtTimeStr(e.pmTimeOut)}</td>
            <td class="font-mono">${(e.pmTimeOut || e.amTimeOut) ? fmtHours(e.hoursRendered) : '--'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      ` : `<div class="empty-state">${ICONS.clock}<h4>No entries yet</h4><p>Clock in to start tracking your OJT hours.</p></div>`}
    </div>
  `;
}

export function mount() {
  const s = store.state.settings;
  const btn = document.getElementById('btn-clock');
  if (btn) {
    btn.addEventListener('click', async () => {
      try {
        const today = getCurrentDate(), now = getCurrentTime();
        const { phase, entry } = store.getClockPhase(today);
        if (phase === 0) {
          await store.addEntry({ date: today, amTimeIn: now, amTimeOut: '', pmTimeIn: '', pmTimeOut: '', hoursRendered: 0, overtimeHours: 0, lateMinutes: calculateLate(now, s.expectedTimeIn), undertimeMinutes: 0, remarks: '', activities: '' });
          toast('AM Clocked In!', 'success');
        } else if (phase === 1) {
          const hrs = calculateEntryHours({ ...entry, amTimeOut: now });
          await store.updateEntry(entry.id, { amTimeOut: now, hoursRendered: hrs, overtimeHours: calculateOvertime(hrs) });
          toast('AM Clocked Out!', 'success');
        } else if (phase === 2) {
          await store.updateEntry(entry.id, { pmTimeIn: now });
          toast('PM Clocked In!', 'success');
        } else if (phase === 3) {
          const hrs = calculateEntryHours({ ...entry, pmTimeOut: now });
          await store.updateEntry(entry.id, { pmTimeOut: now, hoursRendered: hrs, overtimeHours: calculateOvertime(hrs), undertimeMinutes: calculateUndertime(now, s.expectedTimeOut) });
          toast('PM Clocked Out! ' + fmtHours(hrs) + ' recorded.', 'success');
        }
      } catch (err) {
        toast(err.message || 'Failed to update clock entry', 'error');
      }
    });
  }
  // Live clock
  const clockEl = document.querySelector('.clock-time');
  if (clockIntervalId) {
    clearInterval(clockIntervalId);
    clockIntervalId = null;
  }
  if (clockEl) {
    clockIntervalId = setInterval(() => {
      clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }, 30000);
  }
}
