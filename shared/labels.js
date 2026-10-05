export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatHolidayTypeLabel(type) {
  return String(type || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
