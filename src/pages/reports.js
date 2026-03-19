import { store } from '../store.js';
import { fmtHours, fmtMinutes, MONTHS, ICONS } from '../utils.js';

let activeTab = 'overview';

function getMonthlyData() {
  const months = {};
  store.state.entries.forEach(e => {
    if (!e.timeOut) return;
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
    if (!e.timeOut) return;
    const d = new Date(e.date + 'T00:00:00');
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    const key = start.toISOString().split('T')[0];
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

export function render() {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'weekly', label: 'Weekly' },
  ];

  let tabContent = '';
  if (activeTab === 'overview') tabContent = renderOverview();
  else if (activeTab === 'monthly') tabContent = renderMonthly();
  else if (activeTab === 'weekly') tabContent = renderWeekly();

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
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      window.dispatchEvent(new Event('hashchange'));
    });
  });
}
