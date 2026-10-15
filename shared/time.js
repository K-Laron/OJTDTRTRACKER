const TIME_RE = /^\d{2}:\d{2}$/;

export function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseTimeStrict(value) {
  if (!value) return null;
  if (!TIME_RE.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

// ponytail: lenient variant kept for existing client callers that pass single-digit times.
// Do not merge with strict until those callers are fixed.
export function parseTimeLenient(value) {
  if (!value) return null;
  const [h, m] = String(value).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function calculateHours(timeIn, timeOut, breakMins = 0) {
  const start = parseTimeStrict(timeIn);
  const end = parseTimeStrict(timeOut);
  if (start == null || end == null) return 0;
  return Math.max(0, (end - start - breakMins) / 60);
}

export function calculateLate(timeIn, expected) {
  const actual = parseTimeStrict(timeIn);
  const baseline = parseTimeStrict(expected);
  if (actual == null || baseline == null) return 0;
  return Math.max(0, actual - baseline);
}

export function calculateUndertime(timeOut, expected) {
  const actual = parseTimeStrict(timeOut);
  const baseline = parseTimeStrict(expected);
  if (actual == null || baseline == null) return 0;
  return Math.max(0, baseline - actual);
}

export function calculateEntryHours(entry = {}) {
  let total = 0;
  if (entry.amTimeIn && entry.amTimeOut) total += calculateHours(entry.amTimeIn, entry.amTimeOut);
  if (entry.pmTimeIn && entry.pmTimeOut) total += calculateHours(entry.pmTimeIn, entry.pmTimeOut);
  return total;
}
