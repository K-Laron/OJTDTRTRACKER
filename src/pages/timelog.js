import { store } from '../store.js';
import { fmtHours, fmtDate, getDayName, getCurrentDate, toast,
  openModal, closeModal, confirmDialog, calculateEntryHours, calculateOvertime,
  calculateLate, calculateUndertime, fmtMinutes, ICONS, fmtTimeStr } from '../utils.js';

let filterMonth = '';

function getMostCommonTime(field) {
  const entries = store.getAllEntries().slice(0, 5);
  const counts = {};
  let max = 0, res = '';
  entries.forEach(e => {
    const val = e[field];
    if (val) {
      counts[val] = (counts[val] || 0) + 1;
      if (counts[val] > max) { max = counts[val]; res = val; }
    }
  });
  return res;
}

function entryForm(entry = null) {
  const isEdit = !!entry;
  const defAmIn = isEdit ? (entry.amTimeIn || '') : getMostCommonTime('amTimeIn');
  const defAmOut = isEdit ? (entry.amTimeOut || '') : getMostCommonTime('amTimeOut');
  const defPmIn = isEdit ? (entry.pmTimeIn || '') : getMostCommonTime('pmTimeIn');
  const defPmOut = isEdit ? (entry.pmTimeOut || '') : getMostCommonTime('pmTimeOut');

  return `
    <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Add'} Entry</h3><button class="btn-icon modal-close-btn">${ICONS.x}</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Date</label><input type="date" id="entry-date" value="${entry?.date || getCurrentDate()}"></div>
      <div style="display:flex;gap:16px;align-items:center;margin:16px 0 8px"><span style="font-weight:700;font-size:0.9rem;color:var(--primary)">☀️ Morning (AM)</span><hr style="flex:1;border:none;border-top:1px solid var(--border)"></div>
      <div class="form-row">
        <div class="form-group"><label>AM Time In</label><input type="time" id="entry-am-in" value="${defAmIn}"></div>
        <div class="form-group"><label>AM Time Out</label><input type="time" id="entry-am-out" value="${defAmOut}"></div>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin:16px 0 8px"><span style="font-weight:700;font-size:0.9rem;color:var(--warning)">🌙 Afternoon (PM)</span><hr style="flex:1;border:none;border-top:1px solid var(--border)"></div>
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

async function saveEntry(id = null) {
  const date = document.getElementById('entry-date').value;
  const amIn = document.getElementById('entry-am-in').value;
  const amOut = document.getElementById('entry-am-out').value;
  const pmIn = document.getElementById('entry-pm-in').value;
  const pmOut = document.getElementById('entry-pm-out').value;
  const remarks = document.getElementById('entry-remarks').value;
  const activities = document.getElementById('entry-activities').value;
  const s = store.state.settings;
  if (!date) { toast('Date is required', 'error'); return; }
  if (!amIn && !pmIn) { toast('At least one time in is required', 'error'); return; }
  if (amIn && amOut && amIn >= amOut) { toast('AM Out must be after AM In', 'error'); return; }
  if (pmIn && pmOut && pmIn >= pmOut) { toast('PM Out must be after PM In', 'error'); return; }
  const d = { date, amTimeIn: amIn, amTimeOut: amOut, pmTimeIn: pmIn, pmTimeOut: pmOut, remarks, activities };
  const hrs = calculateEntryHours(d);
  d.hoursRendered = hrs; d.overtimeHours = calculateOvertime(hrs);
  d.lateMinutes = amIn ? calculateLate(amIn, s.expectedTimeIn) : 0;
  d.undertimeMinutes = pmOut ? calculateUndertime(pmOut, s.expectedTimeOut) : 0;
  if (id) { await store.updateEntry(id, d); toast('Entry updated', 'success'); }
  else { await store.addEntry(d); toast('Entry added', 'success'); }
  closeModal(); window.dispatchEvent(new Event('hashchange'));
}

function getFilteredEntries() {
  let entries = store.getAllEntries();
  if (filterMonth) { const [y, m] = filterMonth.split('-').map(Number); entries = entries.filter(e => { const d = new Date(e.date); return d.getFullYear() === y && d.getMonth() === m - 1; }); }
  return entries;
}

export function render() {
  const entries = getFilteredEntries();
  const months = [...new Set(store.getAllEntries().map(e => e.date.slice(0, 7)))].sort().reverse();

  return `
    <div class="page-header">
      <div><h2>Time Log</h2><p>Manage your daily time records</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="btn-add-entry">${ICONS.plus} Add Entry</button></div>
    </div>
    <div class="filter-bar no-print">
      <span class="filter-label">${ICONS.filter} Filter:</span>
      <select id="filter-month"><option value="">All Months</option>${months.map(m => `<option value="${m}" ${filterMonth === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
    </div>
    ${entries.length ? `
      <div class="table-wrap"><table><thead><tr>
        <th>Date</th><th>Day</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th>
        <th>Hours</th><th>OT</th><th>Late</th><th>Actions</th>
      </tr></thead><tbody>
        ${entries.map(e => `<tr>
          <td>${fmtDate(e.date)}</td><td>${getDayName(e.date)}</td>
          <td class="font-mono">${fmtTimeStr(e.amTimeIn)}</td><td class="font-mono">${fmtTimeStr(e.amTimeOut)}</td>
          <td class="font-mono">${fmtTimeStr(e.pmTimeIn)}</td><td class="font-mono">${fmtTimeStr(e.pmTimeOut)}</td>
          <td class="font-mono">${(e.amTimeOut || e.pmTimeOut) ? fmtHours(e.hoursRendered) : '--'}</td>
          <td class="font-mono">${e.overtimeHours > 0 ? fmtHours(e.overtimeHours) : '--'}</td>
          <td class="font-mono">${e.lateMinutes > 0 ? fmtMinutes(e.lateMinutes) : '--'}</td>
          <td><div class="table-actions">
            <button class="btn-icon btn-edit" data-id="${e.id}" title="Edit">${ICONS.edit}</button>
            <button class="btn-icon btn-delete" data-id="${e.id}" title="Delete">${ICONS.trash}</button>
          </div></td>
        </tr>`).join('')}
      </tbody></table></div>
      <div class="mt-4 text-muted" style="font-size:0.85rem">Showing ${entries.length} entries</div>
    ` : `<div class="card"><div class="empty-state">${ICONS.document}<h4>No entries found</h4><p>${filterMonth ? 'Try adjusting your filters.' : 'Add your first entry.'}</p></div></div>`}
  `;
}

export function mount() {
  document.getElementById('btn-add-entry')?.addEventListener('click', () => {
    openModal(entryForm());
    document.getElementById('entry-save').onclick = () => saveEntry();
    document.querySelector('.modal-close-btn').onclick = closeModal;
    document.querySelector('.modal-cancel-btn').onclick = closeModal;
  });
  document.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', () => {
    const e = store.getEntry(b.dataset.id); if (!e) return;
    openModal(entryForm(e));
    document.getElementById('entry-save').onclick = () => saveEntry(e.id);
    document.querySelector('.modal-close-btn').onclick = closeModal;
    document.querySelector('.modal-cancel-btn').onclick = closeModal;
  }));
  document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', async () => {
    if (await confirmDialog('Delete this entry?')) { 
      await store.deleteEntry(b.dataset.id); 
      toast('Deleted', 'info'); 
      window.dispatchEvent(new Event('hashchange')); 
    }
  }));
  // Filters
  document.getElementById('filter-month')?.addEventListener('change', e => { filterMonth = e.target.value; window.dispatchEvent(new Event('hashchange')); });
}
