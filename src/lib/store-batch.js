export async function applyTemplateToDates(store, templateId, dates = [], { overwrite = false } = {}) {
  const template = store.getActivityTemplates().find(item => item.id === templateId);
  if (!template) throw new Error('Template not found');

  for (const date of dates) {
    const current = store.getEntryByDate(date);
    if (current) {
      await store.updateEntry(current.id, {
        ...current,
        status: store.getEntryStatus(current),
        activities: overwrite || !String(current.activities || '').trim() ? template.activities : current.activities,
        remarks: overwrite || !String(current.remarks || '').trim() ? template.remarks : current.remarks,
      });
    } else {
      await store.addEntry({
        date,
        status: 'absent',
        activities: template.activities,
        remarks: template.remarks,
      });
    }
  }
}

export function findPreviousWorkingEntry(store, date) {
  return store.getAllEntriesWithDerivedStatus().find(entry => (
    entry.date < date && entry.status === 'present' && String(entry.activities || '').trim()
  )) || null;
}

export async function reusePreviousWorkingDay(store, date, { overwrite = false } = {}) {
  const previous = findPreviousWorkingEntry(store, date);
  if (!previous) throw new Error('No previous working day with activities found');

  const current = store.getEntryByDate(date);
  if (current) {
    await store.updateEntry(current.id, {
      ...current,
      status: store.getEntryStatus(current),
      activities: overwrite || !String(current.activities || '').trim() ? previous.activities : current.activities,
      remarks: overwrite || !String(current.remarks || '').trim() ? previous.remarks : current.remarks,
    });
    return;
  }

  await store.addEntry({
    date,
    status: 'absent',
    activities: previous.activities,
    remarks: previous.remarks,
  });
}

export async function batchUpdateStatuses(store, dates = [], status, { overwrite = false } = {}) {
  const normalizedStatus = store.getEntryStatus({ status });
  for (const date of dates) {
    const current = store.getEntryByDate(date);
    if (current) {
      if (!overwrite && store.getEntryStatus(current) === normalizedStatus) continue;
      await store.updateEntry(current.id, { ...current, status: normalizedStatus });
    } else {
      await store.addEntry({ date, status: normalizedStatus, remarks: '', activities: '' });
    }
  }
}
