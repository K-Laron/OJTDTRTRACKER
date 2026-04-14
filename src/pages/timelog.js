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
let selectedDates = new Set();

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
  const status = entry?.status || 'present';
  const defAmIn = isEdit ? (entry.amTimeIn || '') : getMostCommonTime('amTimeIn');
  const defAmOut = isEdit ? (entry.amTimeOut || '') : getMostCommonTime('amTimeOut');
  const defPmIn = isEdit ? (entry.pmTimeIn || '') : getMostCommonTime('pmTimeIn');
  const defPmOut = isEdit ? (entry.pmTimeOut || '') : getMostCommonTime('pmTimeOut');

  return `
    <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Add'} Entry</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
    <div class="modal-body">
      <div class="form-group">
        <label>Status</label>
        <select id="entry-status">
          <option value="present" ${status === 'present' ? 'selected' : ''}>Present</option>
          <option value="leave" ${status === 'leave' ? 'selected' : ''}>Leave</option>
          <option value="vacation" ${status === 'vacation' ? 'selected' : ''}>Vacation</option>
          <option value="holiday" ${status === 'holiday' ? 'selected' : ''}>Holiday</option>
          <option value="no_ojt" ${status === 'no_ojt' ? 'selected' : ''}>No OJT</option>
          <option value="absent" ${status === 'absent' ? 'selected' : ''}>Absent</option>
        </select>
      </div>
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

function toggleSelectedDate(date, checked) {
  if (checked) selectedDates.add(date);
  else selectedDates.delete(date);
}

function clearSelectedDates() {
  selectedDates = new Set();
}

function getSelectedDates() {
  return [...selectedDates].sort();
}

function openTemplateManager() {
  const templates = store.getActivityTemplates();
  openModal(`
    <div class="modal-header"><h3>Activity Templates</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Template Name</label><input type="text" id="template-name" placeholder="e.g. Documentation"></div>
      <div class="form-group"><label>Activities</label><textarea id="template-activities" placeholder="Template activities"></textarea></div>
      <div class="form-group"><label>Remarks</label><input type="text" id="template-remarks" placeholder="Optional remarks"></div>
      <div class="table-wrap" style="margin-top:16px">
        <table>
          <thead><tr><th>Name</th><th>Activities</th><th>Remarks</th><th>Actions</th></tr></thead>
          <tbody>
            ${templates.map(template => `<tr>
              <td>${template.name}</td>
              <td>${template.activities}</td>
              <td>${template.remarks || '--'}</td>
              <td><button class="btn-icon btn-template-delete" data-id="${template.id}" title="Delete">${ICONS.trash}</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost modal-cancel-btn">Close</button>
      <button class="btn btn-primary" id="template-save">Save Template</button>
    </div>
  `);
  document.querySelector('.modal-close-btn').onclick = closeModal;
  document.querySelector('.modal-cancel-btn').onclick = closeModal;
  document.getElementById('template-save').onclick = () => {
    const name = document.getElementById('template-name').value.trim();
    const activities = document.getElementById('template-activities').value.trim();
    const remarks = document.getElementById('template-remarks').value.trim();
    if (!name || !activities) {
      toast('Template name and activities are required', 'error');
      return;
    }
    store.saveActivityTemplate({ name, activities, remarks });
    toast('Template saved', 'success');
    closeModal();
    openTemplateManager();
  };
  document.querySelectorAll('.btn-template-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      store.deleteActivityTemplate(btn.dataset.id);
      toast('Template deleted', 'info');
      closeModal();
      openTemplateManager();
    });
  });
}

async function saveEntry(id = null) {
  const status = document.getElementById('entry-status').value;
  const date = document.getElementById('entry-date').value;
  const amIn = document.getElementById('entry-am-in').value;
  const amOut = document.getElementById('entry-am-out').value;
  const pmIn = document.getElementById('entry-pm-in').value;
  const pmOut = document.getElementById('entry-pm-out').value;
  const remarks = document.getElementById('entry-remarks').value;
  const activities = document.getElementById('entry-activities').value;
  const settings = store.state.settings;
  const isPresent = status === 'present';

  if (!date) {
    toast('Date is required', 'error');
    return;
  }
  if (isPresent && !amIn && !pmIn) {
    toast('At least one time in is required', 'error');
    return;
  }
  if (isPresent && amIn && amOut && amIn >= amOut) {
    toast('AM Out must be after AM In', 'error');
    return;
  }
  if (isPresent && pmIn && pmOut && pmIn >= pmOut) {
    toast('PM Out must be after PM In', 'error');
    return;
  }

  const entry = {
    date,
    status,
    amTimeIn: isPresent ? amIn : '',
    amTimeOut: isPresent ? amOut : '',
    pmTimeIn: isPresent ? pmIn : '',
    pmTimeOut: isPresent ? pmOut : '',
    remarks,
    activities,
  };
  const hoursRendered = isPresent ? calculateEntryHours(entry) : 0;
  entry.hoursRendered = hoursRendered;
  entry.overtimeHours = isPresent ? calculateOvertime(hoursRendered) : 0;
  entry.lateMinutes = isPresent && amIn ? calculateLate(amIn, settings.expectedTimeIn) : 0;
  entry.undertimeMinutes = isPresent && pmOut ? calculateUndertime(pmOut, settings.expectedTimeOut) : 0;

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
    <div class="page-actions no-print" style="margin:0 0 12px 0;justify-content:space-between">
      <div class="text-muted" style="align-self:center">${getSelectedDates().length} selected</div>
      <div class="table-actions">
        <button class="btn btn-secondary" id="btn-template-manager">Templates</button>
        <button class="btn btn-secondary" id="btn-reuse-prev" ${getSelectedDates().length === 1 ? '' : 'disabled'}>Reuse Previous Day</button>
        <button class="btn btn-secondary" id="btn-apply-template" ${getSelectedDates().length ? '' : 'disabled'}>Apply Template</button>
        <button class="btn btn-secondary" id="btn-mark-leave" ${getSelectedDates().length ? '' : 'disabled'}>Mark Leave</button>
        <button class="btn btn-secondary" id="btn-mark-vacation" ${getSelectedDates().length ? '' : 'disabled'}>Mark Vacation</button>
        <button class="btn btn-secondary" id="btn-mark-no-ojt" ${getSelectedDates().length ? '' : 'disabled'}>Mark No OJT</button>
        <button class="btn btn-secondary" id="btn-mark-present" ${getSelectedDates().length ? '' : 'disabled'}>Mark Present</button>
        <button class="btn btn-ghost" id="btn-clear-selection" ${getSelectedDates().length ? '' : 'disabled'}>Clear Selection</button>
      </div>
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Select</th><th>Date</th><th>Day</th><th>Status</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th>
      <th>Hours</th><th>OT</th><th>Late</th><th>Actions</th>
    </tr></thead><tbody>
      ${items.map(entry => `<tr>
        <td><input type="checkbox" class="row-select" data-date="${entry.date}" ${selectedDates.has(entry.date) ? 'checked' : ''}></td>
        <td>${fmtDate(entry.date)}</td><td>${getDayName(entry.date)}</td>
        <td>${store.formatStatusLabel(store.getEntryStatus(entry))}</td>
        <td class="font-mono">${fmtTimeStr(entry.amTimeIn)}</td><td class="font-mono">${fmtTimeStr(entry.amTimeOut)}</td>
        <td class="font-mono">${fmtTimeStr(entry.pmTimeIn)}</td><td class="font-mono">${fmtTimeStr(entry.pmTimeOut)}</td>
        <td class="font-mono">${store.getEntryStatus(entry) === 'present' && (entry.amTimeOut || entry.pmTimeOut) ? fmtHours(entry.hoursRendered) : '--'}</td>
        <td class="font-mono">${store.getEntryStatus(entry) === 'present' && entry.overtimeHours > 0 ? fmtHours(entry.overtimeHours) : '--'}</td>
        <td class="font-mono">${store.getEntryStatus(entry) === 'present' && entry.lateMinutes > 0 ? fmtMinutes(entry.lateMinutes) : '--'}</td>
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

    if (target.closest('#btn-template-manager') || target.closest('#btn-template-manager-header')) {
      openTemplateManager();
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
      return;
    }

    if (target.closest('#btn-clear-selection')) {
      clearSelectedDates();
      refreshTimelog(root);
      return;
    }

    if (target.closest('#btn-reuse-prev')) {
      const dates = getSelectedDates();
      if (dates.length !== 1) return;
      store.reusePreviousWorkingDay(dates[0], { overwrite: false })
        .then(() => {
          toast('Previous working day reused', 'success');
          clearSelectedDates();
          refreshTimelog(root);
        })
        .catch(err => toast(err.message || 'Failed to reuse previous day', 'error'));
      return;
    }

    if (target.closest('#btn-apply-template')) {
      const dates = getSelectedDates();
      const templates = store.getActivityTemplates();
      if (!dates.length || !templates.length) return;
      openModal(`
        <div class="modal-header"><h3>Apply Template</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
        <div class="modal-body">
          <div class="form-group"><label>Template</label>
            <select id="apply-template-id">${templates.map(template => `<option value="${template.id}">${template.name}</option>`).join('')}</select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="apply-template-save">Apply</button>
        </div>
      `);
      document.querySelector('.modal-close-btn').onclick = closeModal;
      document.querySelector('.modal-cancel-btn').onclick = closeModal;
      document.getElementById('apply-template-save').onclick = () => {
        const templateId = document.getElementById('apply-template-id').value;
        store.applyTemplateToDates(templateId, dates, { overwrite: false })
          .then(() => {
            closeModal();
            clearSelectedDates();
            toast('Template applied', 'success');
            refreshTimelog(root);
          })
          .catch(err => toast(err.message || 'Failed to apply template', 'error'));
      };
      return;
    }

    const statusAction = target.closest('#btn-mark-leave, #btn-mark-vacation, #btn-mark-no-ojt, #btn-mark-present');
    if (statusAction) {
      const dates = getSelectedDates();
      if (!dates.length) return;
      const status = statusAction.id === 'btn-mark-leave'
        ? 'leave'
        : statusAction.id === 'btn-mark-vacation'
          ? 'vacation'
          : statusAction.id === 'btn-mark-no-ojt'
            ? 'no_ojt'
            : 'present';
      store.batchUpdateStatuses(dates, status, { overwrite: true })
        .then(() => {
          clearSelectedDates();
          toast(`Marked ${dates.length} date(s) as ${store.formatStatusLabel(status)}`, 'success');
          refreshTimelog(root);
        })
        .catch(err => toast(err.message || 'Failed to update statuses', 'error'));
    }
  });

  root.addEventListener('change', event => {
    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;

    if (element instanceof HTMLSelectElement && element.id === 'filter-month') {
      filterMonth = element.value;
      currentPage = 1;
      invalidateVisibleEntries();
      refreshTimelog(root);
      void loadVisibleEntries(true);
      return;
    }

    if (element instanceof HTMLInputElement && element.classList.contains('row-select')) {
      toggleSelectedDate(element.dataset.date, element.checked);
      refreshTimelog(root);
    }
  });
}

export function render() {
  return `
    <div id="timelog-page">
      <div class="page-header">
        <div><h2>Time Log</h2><p>Manage your daily time records</p></div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-template-manager-header">Templates</button>
          <button class="btn btn-primary" id="btn-add-entry">${ICONS.plus} Add Entry</button>
        </div>
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
