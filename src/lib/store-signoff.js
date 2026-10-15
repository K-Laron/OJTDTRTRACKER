export async function signOffMonth(store, monthKey, supervisor, remarks = '') {
  store.state.signOffs = {
    ...(store.state.signOffs || {}),
    [monthKey]: {
      supervisor: supervisor || store.state.profile.supervisor || 'Supervisor',
      signedAt: new Date().toISOString(),
      remarks: remarks || '',
    },
  };
  await store._saveConfig();
}

export async function retractMonthSignOff(store, monthKey) {
  const updated = { ...(store.state.signOffs || {}) };
  delete updated[monthKey];
  store.state.signOffs = updated;
  await store._saveConfig();
}

export function getMonthSignOff(store, monthKey) {
  return store.state.signOffs?.[monthKey] || null;
}
