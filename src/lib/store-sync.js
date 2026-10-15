export async function fetchAllEntries({ request, headers, isCurrent, pageLimit = 500 }) {
  const pagePath = (page) => `/entries?page=${page}&limit=${pageLimit}`;
  const first = await request(pagePath(1), { headers }, { logoutOn401: true });
  if (!isCurrent()) return null;
  if (Array.isArray(first)) return first;

  const byId = new Map();
  for (const entry of first.items || []) {
    if (entry?.id && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  let page = 2;
  let hasMore = Boolean(first.hasMore);
  while (hasMore) {
    const chunk = await request(pagePath(page), { headers }, { logoutOn401: true });
    if (!isCurrent()) return null;
    if (Array.isArray(chunk)) {
      for (const entry of chunk) {
        if (entry?.id && !byId.has(entry.id)) byId.set(entry.id, entry);
      }
      break;
    }
    for (const entry of chunk.items || []) {
      if (entry?.id && !byId.has(entry.id)) byId.set(entry.id, entry);
    }
    hasMore = Boolean(chunk.hasMore);
    page += 1;
  }
  if (page > 2) {
    const reconcile = await request(pagePath(1), { headers }, { logoutOn401: true });
    if (!isCurrent()) return null;
    const fresh = Array.isArray(reconcile) ? reconcile : (reconcile.items || []);
    const head = [];
    for (const entry of fresh) {
      if (entry?.id && !byId.has(entry.id)) {
        byId.set(entry.id, entry);
        head.push(entry);
      }
    }
    if (head.length) {
      const headIds = new Set(head.map(entry => entry.id));
      return [...head, ...[...byId.values()].filter(entry => !headIds.has(entry.id))];
    }
  }
  return [...byId.values()];
}

export async function refreshResources(store, resources = ['entries', 'holidays', 'config']) {
  if (!store.userId || !store.authToken) return;
  const resourceSet = new Set(resources);
  const headers = store.getAuthHeaders();
  const requests = [];

  if (resourceSet.has('entries')) {
    requests.push(store._request('/entries', { headers }, { logoutOn401: true }).then(entries => ({ key: 'entries', value: entries })));
  }
  if (resourceSet.has('holidays')) {
    requests.push(store._request('/holidays', { headers }, { logoutOn401: true }).then(holidays => ({ key: 'holidays', value: holidays })));
  }
  if (resourceSet.has('config')) {
    requests.push(store._request('/config', { headers }, { logoutOn401: true }).then(config => ({ key: 'config', value: config })));
  }

  if (!requests.length) return;

  const results = await Promise.all(requests);
  if (!store.userId || !store.authToken) return;

  let entries = store.state.entries;
  let holidays = store.state.holidays;
  let config = {
    profile: store.state.profile,
    settings: store.state.settings,
    theme: store.state.theme,
  };

  for (const result of results) {
    if (result.key === 'entries') entries = result.value;
    else if (result.key === 'holidays') holidays = result.value;
    else if (result.key === 'config') config = result.value;
  }

  store._applyServerState(entries, holidays, config, [...resourceSet]);
}
