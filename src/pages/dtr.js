import { store } from '../store.js';
import { fmtHours, getDayName, getDaysInMonth, MONTHS, ICONS, fmtTimeStr } from '../utils.js';

let selYear = new Date().getFullYear();
let selMonth = new Date().getMonth();

export function render() {
  const entries = store.getEntriesByMonth(selYear, selMonth);
  const daysInMonth = getDaysInMonth(selYear, selMonth);
  const profile = store.state.profile;
  const totalHrs = entries.reduce((s, e) => s + (e.hoursRendered || 0), 0);
  const totalOT = entries.reduce((s, e) => s + (e.overtimeHours || 0), 0);

  const rows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayName = getDayName(dateStr);
    const entry = entries.find(e => e.date === dateStr);
    const isWeekend = dayName === 'Sat' || dayName === 'Sun';
    rows.push(`
      <tr style="${isWeekend ? 'opacity:0.5' : ''}">
        <td>${d}</td>
        <td>${dayName}</td>
        <td class="font-mono">${fmtTimeStr(entry?.amTimeIn)}</td>
        <td class="font-mono">${fmtTimeStr(entry?.amTimeOut)}</td>
        <td class="font-mono">${fmtTimeStr(entry?.pmTimeIn)}</td>
        <td class="font-mono">${fmtTimeStr(entry?.pmTimeOut)}</td>
        <td class="font-mono">${(entry?.amTimeOut || entry?.pmTimeOut) ? entry.hoursRendered.toFixed(2) : ''}</td>
        <td class="font-mono">${entry?.overtimeHours > 0 ? entry.overtimeHours.toFixed(2) : ''}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${entry?.activities || ''}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${entry?.remarks || ''}</td>
      </tr>
    `);
  }

  return `
    <div class="page-header">
      <div><h2>DTR Sheet</h2><p>Daily Time Record — ${MONTHS[selMonth]} ${selYear}</p></div>
      <div class="page-actions no-print">
        <button class="btn btn-secondary" id="btn-prev-month">&larr; Prev</button>
        <button class="btn btn-secondary" id="btn-next-month">Next &rarr;</button>
        <button class="btn btn-secondary" id="btn-print-dtr">${ICONS.printer} Print</button>
        <button class="btn btn-primary" id="btn-export-pdf">${ICONS.download} PDF</button>
        <button class="btn btn-success" id="btn-export-excel">${ICONS.download} Excel</button>
      </div>
    </div>

    <div class="dtr-form" id="dtr-printable">
      <div class="dtr-header">
        <h3>Daily Time Record</h3>
        <p>Civil Service Form No. 48</p>
      </div>

      <div class="dtr-info">
        <div class="info-field"><span class="info-label">Name:</span><span class="info-value">${profile.name || '_______________'}</span></div>
        <div class="info-field"><span class="info-label">Department:</span><span class="info-value">${profile.department || '_______________'}</span></div>
        <div class="info-field"><span class="info-label">Month/Year:</span><span class="info-value">${MONTHS[selMonth]} ${selYear}</span></div>
        <div class="info-field"><span class="info-label">Supervisor:</span><span class="info-value">${profile.supervisor || '_______________'}</span></div>
        <div class="info-field"><span class="info-label">Position:</span><span class="info-value">${profile.position || 'OJT Trainee'}</span></div>
        <div class="info-field"><span class="info-label">Schedule:</span><span class="info-value">${store.state.settings.expectedTimeIn} - ${store.state.settings.expectedTimeOut}</span></div>
      </div>

      <div class="table-wrap">
        <table class="dtr-table">
          <thead>
            <tr>
              <th rowspan="2">Day</th>
              <th rowspan="2">Day</th>
              <th colspan="2" style="border-bottom:1px solid var(--border)">A.M.</th>
              <th colspan="2" style="border-bottom:1px solid var(--border)">P.M.</th>
              <th rowspan="2">Hours</th>
              <th rowspan="2">OT</th>
              <th rowspan="2">Activities</th>
              <th rowspan="2">Remarks</th>
            </tr>
            <tr>
              <th>Arrival</th><th>Departure</th>
              <th>Arrival</th><th>Departure</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>

      <div class="dtr-totals">
        <div>Total Hours: <span>${totalHrs.toFixed(2)}</span></div>
        <div>Overtime: <span>${totalOT.toFixed(2)}</span></div>
        <div>Days Worked: <span>${entries.filter(e => e.amTimeOut || e.pmTimeOut).length}</span></div>
      </div>

      <div class="dtr-cert">
        I CERTIFY on my honor that the above is a true and correct report of the hours of work performed,
        record of which was made daily at the time of arrival and departure from office.
      </div>

      <div class="dtr-footer">
        <div class="dtr-signature">
          <div class="sig-line">${profile.name || '_______________'}</div>
          <div class="sig-label">Trainee's Signature</div>
        </div>
        <div class="dtr-signature">
          <div class="sig-line">${profile.supervisor || '_______________'}</div>
          <div class="sig-label">Verified By (Supervisor)</div>
        </div>
      </div>
    </div>
  `;
}

export function mount() {
  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    selMonth--;
    if (selMonth < 0) { selMonth = 11; selYear--; }
    window.dispatchEvent(new Event('hashchange'));
  });

  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    selMonth++;
    if (selMonth > 11) { selMonth = 0; selYear++; }
    window.dispatchEvent(new Event('hashchange'));
  });

  document.getElementById('btn-print-dtr')?.addEventListener('click', () => window.print());

  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    const { exportDTRtoPDF } = await import('../lib/export-pdf.js');
    exportDTRtoPDF(store.getEntriesByMonth(selYear, selMonth), selMonth, selYear, store.state.profile, store.state.settings);
  });

  document.getElementById('btn-export-excel')?.addEventListener('click', async () => {
    const { exportDTRtoExcel } = await import('../lib/export-excel.js');
    exportDTRtoExcel(store.getEntriesByMonth(selYear, selMonth), selMonth, selYear, store.state.profile, store.state.settings);
  });
}
