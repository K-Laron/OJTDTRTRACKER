export function getErrorStatus(err) {
  if (err?.code === 11000) return 400;
  if (typeof err?.message === 'string' && err.message) return 400;
  return 500;
}
