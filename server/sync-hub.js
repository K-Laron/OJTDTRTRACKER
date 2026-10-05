let clients = [];

export function addSyncClient(userId, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connected event
  res.write('data: {"type":"connected"}\n\n');

  const client = { userId, res };
  clients.push(client);

  return () => {
    clients = clients.filter((c) => c !== client);
  };
}

export function notifyClients(userId, resources = ['entries', 'holidays', 'config']) {
  const payload = JSON.stringify({ type: 'update', resources });
  clients
    .filter((c) => c.userId === userId)
    .forEach((client) => client.res.write(`data: ${payload}\n\n`));
}
