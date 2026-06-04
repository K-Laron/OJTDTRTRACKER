import { store } from '../store.js';
import { MONTHS, ICONS, getDaysInMonth, requestRender } from '../utils.js';
import { buildDtrSheetModel } from '../lib/dtr-sheet-model.js';

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
  const sheet = buildDtrSheetModel({
    entries,
    holidays,
    month: selMonth,
    year: selYear,
    profile: store.state.profile,
    settings: store.state.settings,
    getEntryStatus: entry => store.getEntryStatus(entry),
  });
  const profile = sheet.profile;

  const rows = sheet.rows.map(row => `
    <tr class="${row.isMuted ? 'dtr-row-muted' : ''}">
      <td>${row.day}</td>
      <td>${row.dayName}</td>
      <td class="font-mono">${row.amTimeIn}</td>
      <td class="font-mono">${row.amTimeOut}</td>
      <td class="font-mono">${row.pmTimeIn}</td>
      <td class="font-mono">${row.pmTimeOut}</td>
      <td class="font-mono">${row.hoursDisplay}</td>
      <td class="font-mono">${row.overtimeDisplay}</td>
      <td class="dtr-text-cell">${row.remarks}</td>
    </tr>
  `);

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
        <div class="info-field"><span class="info-label">Month/Year:</span><span class="info-value">${sheet.monthLabel}</span></div>
        <div class="info-field"><span class="info-label">Supervisor:</span><span class="info-value">${profile.supervisor || '_______________'}</span></div>
        <div class="info-field"><span class="info-label">Position:</span><span class="info-value">${profile.position || 'OJT Trainee'}</span></div>
        <div class="info-field"><span class="info-label">Schedule:</span><span class="info-value">${sheet.scheduleText}</span></div>
      </div>

      <div class="table-wrap">
        <table class="dtr-table">
          <colgroup>
            <col class="dtr-col-day-number">
            <col class="dtr-col-day-name">
            <col class="dtr-col-time">
            <col class="dtr-col-time">
            <col class="dtr-col-time">
            <col class="dtr-col-time">
            <col class="dtr-col-hours">
            <col class="dtr-col-ot">
            <col class="dtr-col-remarks">
          </colgroup>
          <thead>
            <tr>
              <th rowspan="2">Day</th>
              <th rowspan="2">Day</th>
              <th colspan="2" style="border-bottom:1px solid var(--border)">A.M.</th>
              <th colspan="2" style="border-bottom:1px solid var(--border)">P.M.</th>
              <th rowspan="2">Hours</th>
              <th rowspan="2">OT</th>
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
        <div>Month Total Hours: <span>${sheet.totals.totalHoursDisplay}</span></div>
        <div>Overtime: <span>${sheet.totals.totalOvertimeDisplay}</span></div>
        <div>Days Worked: <span>${sheet.totals.daysWorked}</span></div>
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
      exportDTRtoPDF(getVisibleEntries(), store.getHolidaysInMonth(selYear, selMonth), selMonth, selYear, store.state.profile, store.state.settings, store.username);
      return;
    }

    const exportExcelButton = target.closest('#btn-export-excel');
    if (exportExcelButton) {
      const { exportDTRtoExcel } = await import('../lib/export-excel.js');
      exportDTRtoExcel(getVisibleEntries(), store.getHolidaysInMonth(selYear, selMonth), selMonth, selYear, store.state.profile, store.state.settings, store.username);
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
