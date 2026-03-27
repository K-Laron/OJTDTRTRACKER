import { store } from '../store.js';
import {
  fmtHours,
  fmtDate,
  getDayName,
  getCurrentDate,
  getDaysInMonth,
  toast,
  openModal,
  closeModal,
  confirmDialog,
  calculateEntryHours,
  calculateOvertime,
  calculateLate,
  calculateUndertime,
  fmtMinutes,
  ICONS,
  fmtTimeStr,
  requestRender,
} from '../utils.js';

const PAGE_SIZE = 50;

let filterMonth = '';
let currentPage = 1;
let visibleEntries = null;
let visibleEntriesKey = '';
let visibleEntriesVersion = -1;
let visibleEntriesMeta = { page: 1, limit: PAGE_SIZE, total: 0, hasMore: false };
let visibleEntriesLoading = false;
let visibleEntriesError = '';
let visibleEntriesRequestId = 0;
let availableMonthsCache = [];
let availableMonthsVersion = -1;

function getMostCommonTime(field) {
  const entries = store.getAllEntries().slice(0, 5);
  const counts = {};
  let max = 0;
  let result = '';
  entries.forEach(entry => {
    const value = entry[field];
    if (!value) return;
    counts[value] = (counts[value] || 0) + 1;
    if (counts[value] > max) {
      max = counts[value];
      result = value;
    }
  });
  return result;
}

function entryForm(entry = null) {
  const isEdit = Boolean(entry);
  const defAmIn = isEdit ? (entry.amTimeIn || '') : getMostCommonTime('amTimeIn');
  const defAmOut = isEdit ? (entry.amTimeOut || '') : getMostCommonTime('amTimeOut');
  const defPmIn = isEdit ? (entry.pmTimeIn || '') : getMostCommonTime('pmTimeIn');
  const defPmOut = isEdit ? (entry.pmTimeOut || '') : getMostCommonTime('pmTimeOut');

  return `
    <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Add'} Entry</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Date</label><input type="date" id="entry-date" value="${entry?.date || getCurrentDate()}"></div>
      <div style="display:flex;gap:16px;align-items:center;margin:16px 0 8px"><span style="font-weight:700;font-size:0.9rem;color:var(--primary)">Morning (AM)</span><hr style="flex:1;border:none;border-top:1px solid var(--border)"></div>
      <div class="form-row">
        <div class="form-group"><label>AM Time In</label><input type="time" id="entry-am-in" value="${defAmIn}"></div>
        <div class="form-group"><label>AM Time Out</label><input type="time" id="entry-am-out" value="${defAmOut}"></div>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin:16px 0 8px"><span style="font-weight:700;font-size:0.9rem;color:var(--warning)">Afternoon (PM)</span><hr style="flex:1;border:none;border-top:1px solid var(--border)"></div>
      <div class="form-row">
        <div class="form-group"><label>PM Time In</label><input type="time" id="entry-pm-in" value="${defPmIn}"></div>
        <div class="form-group"><label>PM Time Out</label><input type="time" id="entry-pm-out" value="${defPmOut}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Remarks</label><input type="text" id="entry-remarks" value="${entry?.remarks || ''}" placeholder="Optional"></div>
      </div>
      <div class="form-group"><label>Activities / Tasks Done</label><textarea id="entry-activities" placeholder="What did you work on today?">${entry?.activities || ''}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost modal-cancel-btn">Cancel</button><button class="btn btn-primary" id="entry-save">${isEdit ? 'Save Changes' : 'Add Entry'}</button></div>
  `;
}

function formatConflictFields(fields = []) {
  if (!fields.length) return 'another change';
  if (fields.includes('delete')) return 'the latest saved version';
  return fields.join(', ');
}

function showConflictModal(entryId, { conflicts = [], allowDeleteLatest = false } = {}) {
  const entry = store.getEntry(entryId);
  if (!entry) return;
  openModal(`
    <div class="modal-header"><h3>Entry Updated</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
    <div class="modal-body">
      <p style="margin-bottom:12px">The entry changed before your action completed. The latest version is now loaded.</p>
      <p class="text-muted" style="margin-bottom:12px">Conflicting fields: ${formatConflictFields(conflicts)}</p>
      <table style="width:100%">
        <tr><td class="text-muted">Date</td><td>${fmtDate(entry.date)}</td></tr>
        <tr><td class="text-muted">AM</td><td class="font-mono">${fmtTimeStr(entry.amTimeIn)} - ${fmtTimeStr(entry.amTimeOut)}</td></tr>
        <tr><td class="text-muted">PM</td><td class="font-mono">${fmtTimeStr(entry.pmTimeIn)} - ${fmtTimeStr(entry.pmTimeOut)}</td></tr>
        <tr><td class="text-muted">Hours</td><td>${fmtHours(entry.hoursRendered)}</td></tr>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost modal-cancel-btn">Close</button>
      ${allowDeleteLatest ? '<button class="btn btn-secondary" id="conflict-delete-latest">Delete Latest</button>' : ''}
      <button class="btn btn-primary" id="conflict-edit-latest">Edit Latest</button>
    </div>
  `);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.querySelector('.modal-cancel-btn').onclick = closeModal;
  document.getElementById('conflict-delete-latest')?.addEventListener('click', async () => {
    try {
      await store.forceDeleteEntry(entryId);
      closeModal();
      toast('Latest entry deleted', 'info');
    } catch (err) {
      toast(err.message || 'Failed to delete latest entry', 'error');
    }
  });
  document.getElementById('conflict-edit-latest').onclick = () => {
    closeModal();
    openEntryEditor(store.getEntry(entryId));
  };
}

function openEntryEditor(entry) {
  if (entry === null) return;
  openModal(entryForm(entry));
  document.getElementById('entry-save').onclick = () => saveEntry(entry?.id || null);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.querySelector('.modal-cancel-btn').onclick = closeModal;
}

async function saveEntry(id = null) {
  const date = document.getElementById('entry-date').value;
  const amIn = document.getElementById('entry-am-in').value;
  const amOut = document.getElementById('entry-am-out').value;
  const pmIn = document.getElementById('entry-pm-in').value;
  const pmOut = document.getElementById('entry-pm-out').value;
  const remarks = document.getElementById('entry-remarks').value;
  const activities = document.getElementById('entry-activities').value;
  const settings = store.state.settings;

  if (!date) {
    toast('Date is required', 'error');
    return;
  }
  if (!amIn && !pmIn) {
    toast('At least one time in is required', 'error');
    return;
  }
  if (amIn && amOut && amIn >= amOut) {
    toast('AM Out must be after AM In', 'error');
    return;
  }
  if (pmIn && pmOut && pmIn >= pmOut) {
    toast('PM Out must be after PM In', 'error');
    return;
  }

  const entry = {
    date,
    amTimeIn: amIn,
    amTimeOut: amOut,
    pmTimeIn: pmIn,
    pmTimeOut: pmOut,
    remarks,
    activities,
  };
  const hoursRendered = calculateEntryHours(entry);
  entry.hoursRendered = hoursRendered;
  entry.overtimeHours = calculateOvertime(hoursRendered);
  entry.lateMinutes = amIn ? calculateLate(amIn, settings.expectedTimeIn) : 0;
  entry.undertimeMinutes = pmOut ? calculateUndertime(pmOut, settings.expectedTimeOut) : 0;

  try {
    if (id) {
      await store.updateEntry(id, entry);
      toast('Entry updated', 'success');
    } else {
      await store.addEntry(entry);
      toast('Entry added', 'success');
    }
    closeModal();
  } catch (err) {
    if (id && err.message === 'Entry changed elsewhere. Latest data was loaded.') {
      closeModal();
      showConflictModal(id, { conflicts: err.conflicts || [] });
      return;
    }
    toast(err.message || 'Failed to save entry', 'error');
  }
}

function getMonthBounds(monthValue) {
  if (!monthValue) return { dateFrom: undefined, dateTo: undefined };
  const [year, month] = monthValue.split('-').map(Number);
  return {
    dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(month).padStart(2, '0')}-${String(getDaysInMonth(year, month - 1)).padStart(2, '0')}`,
  };
}

function getVisibleEntriesKey() {
  return `${store.userId || 'guest'}:${filterMonth || 'all'}:${currentPage}`;
}

function invalidateVisibleEntries() {
  visibleEntries = null;
  visibleEntriesKey = '';
  visibleEntriesVersion = -1;
  visibleEntriesMeta = { page: 1, limit: PAGE_SIZE, total: 0, hasMore: false };
  visibleEntriesError = '';
}

function parseFilterMonth(value) {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month: month - 1 };
}

function getAvailableMonths() {
  const entriesVersion = store.getResourceVersion('entries');
  if (availableMonthsVersion === entriesVersion) {
    return availableMonthsCache;
  }

  availableMonthsCache = [...new Set(store.getAllEntries().map(entry => entry.date.slice(0, 7)))].sort().reverse();
  availableMonthsVersion = entriesVersion;
  return availableMonthsCache;
}

function getLocalFilteredEntries() {
  if (!filterMonth) {
    return store.getAllEntries();
  }

  const parsedMonth = parseFilterMonth(filterMonth);
  if (!parsedMonth) return [];
  return [...store.getEntriesByMonth(parsedMonth.year, parsedMonth.month)].sort((a, b) => b.date.localeCompare(a.date));
}

function getFallbackVisibleState() {
  const entries = getLocalFilteredEntries();
  const start = (currentPage - 1) * PAGE_SIZE;
  const items = entries.slice(start, start + PAGE_SIZE);
  return {
    items,
    page: currentPage,
    limit: PAGE_SIZE,
    total: entries.length,
    hasMore: start + PAGE_SIZE < entries.length,
  };
}

function getVisibleState() {
  if (visibleEntries && visibleEntriesKey === getVisibleEntriesKey() && visibleEntriesVersion === store.getResourceVersion('entries')) {
    return { items: visibleEntries, ...visibleEntriesMeta };
  }
  return getFallbackVisibleState();
}

async function loadVisibleEntries(force = false) {
  if (!store.userId) return;

  const key = getVisibleEntriesKey();
  if (!force && visibleEntries && visibleEntriesKey === key && visibleEntriesVersion === store.getResourceVersion('entries')) {
    return;
  }

  visibleEntriesLoading = true;
  visibleEntriesError = '';
  const requestId = ++visibleEntriesRequestId;
  requestRender();

  try {
    const { dateFrom, dateTo } = getMonthBounds(filterMonth);
    const result = await store.fetchEntries({
      dateFrom,
      dateTo,
      page: currentPage,
      limit: PAGE_SIZE,
    });
    if (requestId !== visibleEntriesRequestId) return;

    const items = Array.isArray(result) ? result : (result.items || []);
    const page = Number.isFinite(result?.page) ? result.page : currentPage;
    const limit = Number.isFinite(result?.limit) ? result.limit : PAGE_SIZE;
    const total = Number.isFinite(result?.total) ? result.total : items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    if (page > totalPages) {
      currentPage = totalPages;
      invalidateVisibleEntries();
      void loadVisibleEntries(true);
      return;
    }

    visibleEntries = items;
    visibleEntriesKey = key;
    visibleEntriesVersion = store.getResourceVersion('entries');
    visibleEntriesMeta = {
      page,
      limit,
      total,
      hasMore: Boolean(result?.hasMore),
    };
  } catch (err) {
    if (requestId !== visibleEntriesRequestId) return;
    visibleEntries = null;
    visibleEntriesKey = '';
    visibleEntriesVersion = -1;
    visibleEntriesError = err.message || 'Failed to load visible entries';
  } finally {
    if (requestId === visibleEntriesRequestId) {
      visibleEntriesLoading = false;
      requestRender();
    }
  }
}

function renderMonthOptions() {
  const months = getAvailableMonths();
  return [
    '<option value="">All Months</option>',
    ...months.map(month => `<option value="${month}" ${filterMonth === month ? 'selected' : ''}>${month}</option>`),
  ].join('');
}

function renderTableSection() {
  const { items, page, limit, total, hasMore } = getVisibleState();
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 1) / limit));
  const start = total ? ((page - 1) * limit) + 1 : 0;
  const end = total ? Math.min(total, start + items.length - 1) : 0;
  const statusMessage = visibleEntriesLoading
    ? '<div class="mt-4 text-muted" style="font-size:0.85rem">Loading current page...</div>'
    : (visibleEntriesError ? `<div class="mt-4 text-muted" style="font-size:0.85rem;color:var(--danger)">${visibleEntriesError}. Showing local data.</div>` : '');

  if (!items.length) {
    return `
      ${statusMessage}
      <div class="card"><div class="empty-state">${ICONS.document}<h4>No entries found</h4><p>${filterMonth ? 'Try adjusting your filters.' : 'Add your first entry.'}</p></div></div>
    `;
  }

  return `
    ${statusMessage}
    <div class="table-wrap"><table><thead><tr>
      <th>Date</th><th>Day</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th>
      <th>Hours</th><th>OT</th><th>Late</th><th>Actions</th>
    </tr></thead><tbody>
      ${items.map(entry => `<tr>
        <td>${fmtDate(entry.date)}</td><td>${getDayName(entry.date)}</td>
        <td class="font-mono">${fmtTimeStr(entry.amTimeIn)}</td><td class="font-mono">${fmtTimeStr(entry.amTimeOut)}</td>
        <td class="font-mono">${fmtTimeStr(entry.pmTimeIn)}</td><td class="font-mono">${fmtTimeStr(entry.pmTimeOut)}</td>
        <td class="font-mono">${(entry.amTimeOut || entry.pmTimeOut) ? fmtHours(entry.hoursRendered) : '--'}</td>
        <td class="font-mono">${entry.overtimeHours > 0 ? fmtHours(entry.overtimeHours) : '--'}</td>
        <td class="font-mono">${entry.lateMinutes > 0 ? fmtMinutes(entry.lateMinutes) : '--'}</td>
        <td><div class="table-actions">
          <button class="btn-icon btn-edit" data-id="${entry.id}" title="Edit">${ICONS.edit}</button>
          <button class="btn-icon btn-delete" data-id="${entry.id}" title="Delete">${ICONS.trash}</button>
        </div></td>
      </tr>`).join('')}
    </tbody></table></div>
    <div class="mt-4 text-muted" style="font-size:0.85rem">Showing ${start}-${end} of ${total} entries</div>
    <div class="page-actions no-print" style="margin-top:12px; justify-content:flex-end">
      <button class="btn btn-secondary" id="btn-prev-page" ${page <= 1 ? 'disabled' : ''}>Previous</button>
      <span class="text-muted" style="align-self:center">Page ${page} of ${totalPages}</span>
      <button class="btn btn-secondary" id="btn-next-page" ${!hasMore ? 'disabled' : ''}>Next</button>
    </div>
  `;
}

function getRoot(container = document) {
  if (container instanceof HTMLElement) {
    return container.querySelector('#timelog-page') || (container.id === 'timelog-page' ? container : null);
  }
  return document.getElementById('timelog-page');
}

function refreshTimelog(root) {
  const filterEl = root.querySelector('#filter-month');
  if (filterEl) {
    filterEl.innerHTML = renderMonthOptions();
    filterEl.value = filterMonth;
  }

  const listRegion = root.querySelector('#timelog-list-region');
  if (listRegion) {
    listRegion.innerHTML = renderTableSection();
  }
}

function bindTimelogEvents(root) {
  if (root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  root.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const addButton = target.closest('#btn-add-entry');
    if (addButton) {
      openEntryEditor();
      return;
    }

    const editButton = target.closest('.btn-edit');
    if (editButton) {
      const entry = store.getEntry(editButton.dataset.id);
      if (!entry) return;
      openEntryEditor(entry);
      return;
    }

    const deleteButton = target.closest('.btn-delete');
    if (deleteButton) {
      if (await confirmDialog('Delete this entry?')) {
        try {
          await store.deleteEntry(deleteButton.dataset.id);
          toast('Deleted', 'info');
        } catch (err) {
          if (err.message === 'Entry changed elsewhere. Latest data was loaded.') {
            showConflictModal(deleteButton.dataset.id, { conflicts: err.conflicts || [], allowDeleteLatest: true });
            return;
          }
          toast(err.message || 'Failed to delete entry', 'error');
        }
      }
      return;
    }

    const prevPageButton = target.closest('#btn-prev-page');
    if (prevPageButton && currentPage > 1) {
      currentPage -= 1;
      invalidateVisibleEntries();
      refreshTimelog(root);
      void loadVisibleEntries(true);
      return;
    }

    const nextPageButton = target.closest('#btn-next-page');
    if (nextPageButton && !nextPageButton.disabled) {
      currentPage += 1;
      invalidateVisibleEntries();
      refreshTimelog(root);
      void loadVisibleEntries(true);
    }
  });

  root.addEventListener('change', event => {
    const target = event.target instanceof HTMLSelectElement ? event.target : null;
    if (!target || target.id !== 'filter-month') return;
    filterMonth = target.value;
    currentPage = 1;
    invalidateVisibleEntries();
    refreshTimelog(root);
    void loadVisibleEntries(true);
  });
}

export function render() {
  return `
    <div id="timelog-page">
      <div class="page-header">
        <div><h2>Time Log</h2><p>Manage your daily time records</p></div>
        <div class="page-actions"><button class="btn btn-primary" id="btn-add-entry">${ICONS.plus} Add Entry</button></div>
      </div>
      <div class="filter-bar no-print">
        <span class="filter-label">${ICONS.filter} Filter:</span>
        <select id="filter-month">${renderMonthOptions()}</select>
      </div>
      <div id="timelog-list-region">${renderTableSection()}</div>
    </div>
  `;
}

export function mount(container) {
  const root = getRoot(container);
  if (!root) return;
  bindTimelogEvents(root);
  void loadVisibleEntries();
}

export function update(container) {
  const root = getRoot(container);
  if (!root) return;
  refreshTimelog(root);
  if (!visibleEntriesLoading && (visibleEntriesKey !== getVisibleEntriesKey() || visibleEntriesVersion !== store.getResourceVersion('entries'))) {
    void loadVisibleEntries(true);
  }
}
