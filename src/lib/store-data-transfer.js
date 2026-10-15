import { upsertEntryForDate } from './entries.js';

export function exportData(store) {
  return JSON.stringify(store.state, null, 2);
}

export async function previewImport(store, json) {
  const data = JSON.parse(json);
  return store._request('/import/preview', {
    method: 'POST',
    headers: store.getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }, { logoutOn401: true });
}

export async function importData(store, json) {
  try {
    const data = JSON.parse(json);
    store._queueLocalSyncSkip();
    await store._request('/import', {
      method: 'POST',
      headers: store.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }, { logoutOn401: true }).catch(err => {
      store._consumeLocalSyncSkip();
      throw err;
    });

    await store.init();
    return true;
  } catch (err) {
    console.error('Import failed:', err);
    return false;
  }
}

export async function restoreEntry(store, snapshot) {
  if (!snapshot?.id) throw new Error('Missing entry snapshot');

  const existingIndex = store.state.entries.findIndex(entry => entry.id === snapshot.id);
  const method = existingIndex === -1 ? 'POST' : 'PUT';
  const path = existingIndex === -1 ? '/entries' : `/entries/${snapshot.id}`;
  const body = existingIndex === -1
    ? snapshot
    : { ...snapshot, previousState: structuredClone(store.state.entries[existingIndex]) };

  store._queueLocalSyncSkip();
  const restored = await store._request(path, {
    method,
    headers: store.getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  }, { logoutOn401: true }).catch(err => {
    store._consumeLocalSyncSkip();
    throw err;
  });

  store.state.entries = existingIndex === -1
    ? upsertEntryForDate(store.state.entries, restored)
    : store.state.entries.map((item, i) => (i === existingIndex ? restored : item));
  store._markResourcesChanged(['entries']);
  store._notify({ resources: ['entries'] });
  return restored;
}

export async function restoreStateSnapshot(store, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Missing state snapshot');
  store._queueLocalSyncSkip();
  await store._request('/import', {
    method: 'POST',
    headers: store.getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(snapshot),
  }, { logoutOn401: true }).catch(err => {
    store._consumeLocalSyncSkip();
    throw err;
  });
  await store.init();
}

export async function clearAllData(store, defaultState) {
  try {
    store._queueLocalSyncSkip();
    await store._request('/import', {
      method: 'POST',
      headers: store.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(defaultState),
    }, { logoutOn401: true }).catch(err => {
      store._consumeLocalSyncSkip();
      throw err;
    });
    store.state = structuredClone(defaultState);
    if (typeof document !== 'undefined' && document.body) {
      document.body.className = '';
    }
    store._markResourcesChanged(['entries', 'holidays', 'config']);
    store._notify({ resources: ['entries', 'holidays', 'config'] });
  } catch (err) {
    console.error('Clear data failed:', err);
    throw err;
  }
}

export async function restoreHoliday(store, snapshot) {
  if (!snapshot?.date) throw new Error('Missing holiday snapshot');
  store._queueLocalSyncSkip();
  const restored = await store._request(`/holidays/${snapshot.date}`, {
    method: 'PUT',
    headers: store.getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(snapshot),
  }, { logoutOn401: true }).catch(err => {
    store._consumeLocalSyncSkip();
    throw err;
  });

  const index = store.state.holidays.findIndex(holiday => holiday.date === restored.date);
  if (index === -1) store.state.holidays.push(restored);
  else store.state.holidays[index] = restored;
  store._markResourcesChanged(['holidays']);
  store._notify({ resources: ['holidays'] });
  return restored;
}

export async function restoreConfig(store, snapshot) {
  if (!snapshot) throw new Error('Missing config snapshot');
  store._queueLocalSyncSkip();
  await store._request('/config', {
    method: 'PUT',
    headers: store.getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(snapshot),
  }, { logoutOn401: true }).catch(err => {
    store._consumeLocalSyncSkip();
    throw err;
  });

  store.state.profile = { ...snapshot.profile };
  store.state.settings = { ...snapshot.settings };
  store.state.theme = snapshot.theme || 'dark';
  if (typeof document !== 'undefined' && document.body) {
    document.body.className = store.state.theme === 'light' ? 'light-theme' : '';
  }
  store._markResourcesChanged(['config']);
  store._notify({ resources: ['config'] });
}
