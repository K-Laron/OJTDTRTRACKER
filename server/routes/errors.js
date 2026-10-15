export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

export function getErrorStatus(err) {
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 600) return err.status;
  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) return err.statusCode;
  if (err?.code === 11000) return 400;
  if (err?.name === 'ValidationError') return 400;
  return 500;
}

export function sendErrorResponse(res, err, fallbackMessage = 'Internal server error', logPrefix = 'Error:') {
  const status = getErrorStatus(err);
  if (status >= 500) {
    console.error(logPrefix, err);
  }
  return res.status(status).json({ error: err?.message || fallbackMessage });
}
