import { store } from '../store.js';
import { ensureYearHolidays } from './holiday-refresh.js';
import { MONTHS, ICONS, getDaysInMonth, requestRender, formatOvertimeDuration, openModal, closeModal, confirmDialog, toast } from '../utils.js';
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
  return ensureYearHolidays(selYear, { force, logTag: 'DTR' });
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
  const monthKey = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
  const signOff = store.getMonthSignOff(monthKey);
  return `
    <div class="page-header">
      <div><h2>DTR Sheet</h2><p>Daily Time Record - ${MONTHS[selMonth]} ${selYear}</p></div>
      <div class="page-actions no-print">
        <button class="btn btn-secondary" id="btn-prev-month">&larr; Prev</button>
        <button class="btn btn-secondary" id="btn-next-month">Next &rarr;</button>
        <button class="btn ${signOff ? "btn-success" : "btn-secondary"}" id="btn-signoff-month">${ICONS.check} ${signOff ? "Signed Off" : "Supervisor Sign-Off"}</button>
        <button class="btn btn-secondary" id="btn-print-dtr">${ICONS.printer} Print</button>
        <button class="btn btn-primary" id="btn-export-pdf">${ICONS.download} PDF</button>
        <button class="btn btn-success" id="btn-export-excel">${ICONS.download} Excel</button>
      </div>
    </div>
  `;
}

function renderSheetContent() {
  const sheet = buildDtrSheetModel({
    entries: getVisibleEntries(),
    holidays: store.getHolidaysInMonth(selYear, selMonth),
    month: selMonth,
    year: selYear,
    profile: store.state.profile,
    settings: store.state.settings,
    getEntryStatus: entry => store.getEntryStatus(entry),
  });
  const monthKey = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
  const signOff = store.getMonthSignOff(monthKey);
  const profile = sheet.profile;
  const hours = (value) => value.toFixed(2);

  const rows = sheet.rows.map(row => `
    <tr class="${row.isMuted ? 'dtr-row-muted' : ''}">
      <td>${row.day}</td>
      <td>${row.dayName.slice(0, 3)}</td>
      <td class="font-mono">${row.amTimeIn === '--' ? '' : row.amTimeIn}</td>
      <td class="font-mono">${row.amTimeOut === '--' ? '' : row.amTimeOut}</td>
      <td class="font-mono">${row.pmTimeIn === '--' ? '' : row.pmTimeIn}</td>
      <td class="font-mono">${row.pmTimeOut === '--' ? '' : row.pmTimeOut}</td>
      <td class="font-mono">${row.hasClockOut ? hours(row.hoursRendered) : ''}</td>
      <td class="font-mono">${row.overtimeHours > 0 ? hours(row.overtimeHours) : ''}</td>
      <td class="dtr-text-cell">${row.activities}</td>
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
        <div>Total Hours: <span>${hours(sheet.totals.totalHours)}</span></div>
        <div>Overtime: <span>${formatOvertimeDuration(sheet.totals.totalOvertime)}</span></div>
        <div>Days Worked: <span>${sheet.totals.daysWorked}</span></div>
      </div>

      <div class="dtr-cert">
        I CERTIFY on my honor that the above is a true and correct report of the hours of work performed,
        record of which was made daily at the time of arrival and departure from office.
      </div>

      ${signOff ? `
      <div class="dtr-verification-badge mb-4" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="color:#06d6a0;display:inline-flex">${ICONS.check}</span>
          <div>
            <div style="font-weight:700;color:#06d6a0;font-size:0.95rem">OFFICIALLY SIGNED OFF & VERIFIED</div>
            <div style="font-size:0.85rem;color:var(--text-muted)">Verified by <strong>${signOff.supervisor}</strong> on ${new Date(signOff.signedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
            ${signOff.remarks ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px"><em>Remarks: ${signOff.remarks}</em></div>` : ""}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm no-print" id="btn-retract-signoff" style="color:var(--text-muted)">Retract</button>
      </div>` : ""}

      <div class="dtr-footer">
        <div class="dtr-signature">
          <div class="sig-line">${profile.name || '_______________'}</div>
          <div class="sig-label">Trainee's Signature</div>
        </div>
        <div class="dtr-signature">
          <div class="sig-line">${signOff ? signOff.supervisor : (profile.supervisor || '_______________')}</div>
          <div class="sig-label">Verified By (Supervisor)${signOff ? ` • Signed ${new Date(signOff.signedAt).toLocaleDateString()}` : ""}</div>
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

    const signOffButton = target.closest('#btn-signoff-month');
    if (signOffButton) {
      const monthKey = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
      const existing = store.getMonthSignOff(monthKey);
      openModal(`
        <div class="modal-header"><h3>Supervisor Sign-Off</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
        <div class="modal-body">
          <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:1rem">
            Record supervisor verification for ${MONTHS[selMonth]} ${selYear}. This marks the monthly report as officially reviewed and approved.
          </p>
          <div class="form-group mb-3">
            <label>Supervisor Name</label>
            <input type="text" id="signoff-supervisor" value="${existing?.supervisor || store.state.profile.supervisor || ''}" placeholder="Supervisor name">
          </div>
          <div class="form-group mb-3">
            <label>Approval Notes / Remarks (Optional)</label>
            <textarea id="signoff-remarks" rows="2" placeholder="e.g. Completed all allocated department deliverables.">${existing?.remarks || ''}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="btn-confirm-signoff">${ICONS.check} Approve & Sign Off</button>
        </div>
      `);
      document.querySelector(".modal-close-btn").onclick = closeModal;
      document.querySelector(".modal-cancel-btn").onclick = closeModal;
      document.getElementById("btn-confirm-signoff").onclick = async () => {
        const supervisor = document.getElementById("signoff-supervisor").value.trim();
        const remarks = document.getElementById("signoff-remarks").value.trim();
        if (!supervisor) {
          toast("Please enter the supervisor name", "error");
          return;
        }
        try {
          await store.signOffMonth(monthKey, supervisor, remarks);
          closeModal();
          toast("Monthly DTR officially signed off!", "success");
          refreshDtr(root);
        } catch (err) {
          toast(err.message || "Failed to save sign-off", "error");
        }
      };
      return;
    }

    const retractButton = target.closest('#btn-retract-signoff');
    if (retractButton) {
      if (await confirmDialog("Retract supervisor sign-off for this month?")) {
        const monthKey = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
        try {
          await store.retractMonthSignOff(monthKey);
          toast("Sign-off retracted", "info");
          refreshDtr(root);
        } catch (err) {
          toast(err.message || "Failed to retract sign-off", "error");
        }
      }
      return;
    }

        const printButton = target.closest('#btn-print-dtr');
    if (printButton) {
      window.print();
      return;
    }

    const exportPdfButton = target.closest('#btn-export-pdf');
    if (exportPdfButton) {
      const monthKey = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
      const signOff = store.getMonthSignOff(monthKey);
      const { exportDTRtoPDF } = await import('../lib/export-pdf.js');
      exportDTRtoPDF(getVisibleEntries(), store.getHolidaysInMonth(selYear, selMonth), selMonth, selYear, store.state.profile, store.state.settings, store.username, signOff);
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
  void ensureVisibleYearHolidays();
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
