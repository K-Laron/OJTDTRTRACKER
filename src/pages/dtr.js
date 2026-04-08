import { store } from '../store.js';
import { getDayName, getDaysInMonth, MONTHS, ICONS, fmtTimeStr, requestRender } from '../utils.js';
import { getScheduledNonWorkingStatus } from '../../shared/work-schedule.js';

let selYear = new Date().getFullYear();
let selMonth = new Date().getMonth();
let monthEntries = null;
let monthEntriesKey = '';
let monthEntriesVersion = -1;
let monthLoading = false;
let monthError = '';
let monthRequestId = 0;

async function ensureVisibleYearHolidays(force = false) {
  if (!store.userId) return;

  try {
    const holidays = await store.refreshHolidays([selYear], { force });
    if (!Array.isArray(holidays)) return;
  } catch (err) {
    console.error('[DTR] Failed to refresh holidays for visible year:', err);
  }
}

function getMonthBounds(year, month) {
  const monthString = String(month + 1).padStart(2, '0');
  return {
    start: `${year}-${monthString}-01`,
    end: `${year}-${monthString}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`,
  };
}

function getMonthKey() {
  return `${store.userId || 'guest'}:${selYear}-${selMonth}`;
}

function invalidateMonthEntries() {
  monthEntries = null;
  monthEntriesKey = '';
  monthEntriesVersion = -1;
  monthError = '';
}

function getVisibleEntries() {
  if (monthEntries && monthEntriesKey === getMonthKey() && monthEntriesVersion === store.getResourceVersion('entries')) {
    return monthEntries;
  }
  return store.getEntriesByMonth(selYear, selMonth);
}

async function loadMonthEntries(force = false) {
  if (!store.userId) return;
  const key = getMonthKey();
  if (!force && monthEntriesKey === key && monthEntriesVersion === store.getResourceVersion('entries') && monthEntries) {
    return;
  }

  monthLoading = true;
  monthError = '';
  const requestId = ++monthRequestId;
  requestRender();

  try {
    const { start, end } = getMonthBounds(selYear, selMonth);
    const result = await store.fetchEntries({ dateFrom: start, dateTo: end });
    if (requestId !== monthRequestId) return;

    const items = Array.isArray(result) ? result : (result.items || []);
    monthEntries = [...items].sort((a, b) => a.date.localeCompare(b.date));
    monthEntriesKey = key;
    monthEntriesVersion = store.getResourceVersion('entries');
  } catch (err) {
    if (requestId !== monthRequestId) return;
    monthEntries = null;
    monthEntriesKey = '';
    monthEntriesVersion = -1;
    monthError = err.message || 'Failed to load month records';
  } finally {
    if (requestId === monthRequestId) {
      monthLoading = false;
      requestRender();
    }
  }
}

function renderHeader() {
  return `
    <div class="page-header">
      <div><h2>DTR Sheet</h2><p>Daily Time Record - ${MONTHS[selMonth]} ${selYear}</p></div>
      <div class="page-actions no-print">
        <button class="btn btn-secondary" id="btn-prev-month">&larr; Prev</button>
        <button class="btn btn-secondary" id="btn-next-month">Next &rarr;</button>
        <button class="btn btn-secondary" id="btn-print-dtr">${ICONS.printer} Print</button>
        <button class="btn btn-primary" id="btn-export-pdf">${ICONS.download} PDF</button>
        <button class="btn btn-success" id="btn-export-excel">${ICONS.download} Excel</button>
      </div>
    </div>
  `;
}

function renderSheetContent() {
  const entries = getVisibleEntries();
  const holidays = store.getHolidaysInMonth(selYear, selMonth);
  const entriesByDate = new Map(entries.map(entry => [entry.date, entry]));
  const holidaysByDate = new Map(holidays.map(holiday => [holiday.date, holiday]));
  const daysInMonth = getDaysInMonth(selYear, selMonth);
  const profile = store.state.profile;
  const scheduleText = `${fmtTimeStr(store.state.settings.expectedTimeIn)} - ${fmtTimeStr(store.state.settings.expectedTimeOut)}`;
  const totalHours = entries.reduce((sum, entry) => sum + ((store.getEntryStatus(entry) === 'present') ? (entry.hoursRendered || 0) : 0), 0);
  const totalOvertime = entries.reduce((sum, entry) => sum + ((store.getEntryStatus(entry) === 'present') ? (entry.overtimeHours || 0) : 0), 0);
  const daysWorked = entries.reduce((count, entry) => count + ((store.getEntryStatus(entry) === 'present' && (entry.amTimeOut || entry.pmTimeOut)) ? 1 : 0), 0);

  const rows = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayName = getDayName(dateStr);
    const entry = entriesByDate.get(dateStr);
    const holiday = holidaysByDate.get(dateStr);
    const isWeekend = dayName === 'Sat' || dayName === 'Sun';
    const derivedStatus = entry
      ? store.getEntryStatus(entry)
      : (holiday
        ? (holiday.type === 'holiday' ? 'holiday' : holiday.type === 'vacation_leave' ? 'vacation' : 'leave')
        : getScheduledNonWorkingStatus(dateStr));
    const holidayLabel = derivedStatus ? derivedStatus.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) : '';
    const isPresent = !derivedStatus || derivedStatus === 'present';
    const activityText = entry?.activities || holiday?.name || '';
    const remarksText = entry?.remarks || holidayLabel || '';

    rows.push(`
      <tr style="${isWeekend || holiday || derivedStatus === 'no_ojt' ? 'opacity:0.5' : ''}">
        <td>${day}</td>
        <td>${dayName}</td>
        <td class="font-mono">${isPresent ? fmtTimeStr(entry?.amTimeIn) : ''}</td>
        <td class="font-mono">${isPresent ? fmtTimeStr(entry?.amTimeOut) : ''}</td>
        <td class="font-mono">${isPresent ? fmtTimeStr(entry?.pmTimeIn) : ''}</td>
        <td class="font-mono">${isPresent ? fmtTimeStr(entry?.pmTimeOut) : ''}</td>
        <td class="font-mono">${isPresent && (entry?.amTimeOut || entry?.pmTimeOut) ? entry.hoursRendered.toFixed(2) : ''}</td>
        <td class="font-mono">${isPresent && entry?.overtimeHours > 0 ? entry.overtimeHours.toFixed(2) : ''}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${activityText}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${remarksText}</td>
      </tr>
    `);
  }

  return `
    ${monthLoading ? '<div class="card mb-4"><div class="empty-state"><h4>Loading month records...</h4></div></div>' : ''}
    ${monthError ? `<div class="card mb-4"><div class="empty-state"><h4>Month data unavailable</h4><p>${monthError}</p></div></div>` : ''}

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
        <div class="info-field"><span class="info-label">Schedule:</span><span class="info-value">${scheduleText}</span></div>
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
        <div>Total Hours: <span>${totalHours.toFixed(2)}</span></div>
        <div>Overtime: <span>${totalOvertime.toFixed(2)}</span></div>
        <div>Days Worked: <span>${daysWorked}</span></div>
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

function getRoot(container = document) {
  if (container instanceof HTMLElement) {
    return container.querySelector('#dtr-page') || (container.id === 'dtr-page' ? container : null);
  }
  return document.getElementById('dtr-page');
}

function refreshDtr(root) {
  const headerRegion = root.querySelector('#dtr-header-region');
  if (headerRegion) headerRegion.innerHTML = renderHeader();

  const contentRegion = root.querySelector('#dtr-content-region');
  if (contentRegion) contentRegion.innerHTML = renderSheetContent();
}

function bindDtrEvents(root) {
  if (root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  root.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const prevButton = target.closest('#btn-prev-month');
    if (prevButton) {
      selMonth -= 1;
      if (selMonth < 0) {
        selMonth = 11;
        selYear -= 1;
      }
      invalidateMonthEntries();
      refreshDtr(root);
      void ensureVisibleYearHolidays();
      void loadMonthEntries(true);
      return;
    }

    const nextButton = target.closest('#btn-next-month');
    if (nextButton) {
      selMonth += 1;
      if (selMonth > 11) {
        selMonth = 0;
        selYear += 1;
      }
      invalidateMonthEntries();
      refreshDtr(root);
      void ensureVisibleYearHolidays();
      void loadMonthEntries(true);
      return;
    }

    const printButton = target.closest('#btn-print-dtr');
    if (printButton) {
      window.print();
      return;
    }

    const exportPdfButton = target.closest('#btn-export-pdf');
    if (exportPdfButton) {
      const { exportDTRtoPDF } = await import('../lib/export-pdf.js');
      exportDTRtoPDF(getVisibleEntries(), store.getHolidaysInMonth(selYear, selMonth), selMonth, selYear, store.state.profile, store.state.settings);
      return;
    }

    const exportExcelButton = target.closest('#btn-export-excel');
    if (exportExcelButton) {
      const { exportDTRtoExcel } = await import('../lib/export-excel.js');
      exportDTRtoExcel(getVisibleEntries(), store.getHolidaysInMonth(selYear, selMonth), selMonth, selYear, store.state.profile, store.state.settings);
    }
  });
}

export function render() {
  return `
    <div id="dtr-page">
      <div id="dtr-header-region">${renderHeader()}</div>
      <div id="dtr-content-region">${renderSheetContent()}</div>
    </div>
  `;
}

export function mount(container) {
  const root = getRoot(container);
  if (!root) return;
  bindDtrEvents(root);
  refreshDtr(root);
  void ensureVisibleYearHolidays(true);
  void loadMonthEntries();
}

export function update(container) {
  const root = getRoot(container);
  if (!root) return;
  refreshDtr(root);
  if (!monthLoading && (monthEntriesKey !== getMonthKey() || monthEntriesVersion !== store.getResourceVersion('entries'))) {
    void loadMonthEntries(true);
  }
}
