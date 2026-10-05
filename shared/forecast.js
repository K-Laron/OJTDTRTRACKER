import { toLocalDateString } from './time.js';

// Pure working-day counter shared by server and client forecasts.
// startDate is YYYY-MM-DD. statusByDate maps dates to statuses (or undefined).
// isWorkday decides schedule days. isExcluded decides dates to skip and record.
export function countWorkingDays({ startDate, daysNeeded, statusByDate = new Map(), isWorkday, isExcluded }) {
  const excludedDates = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  let countedDays = 0;

  while (countedDays < daysNeeded) {
    cursor.setDate(cursor.getDate() + 1);
    const dateKey = toLocalDateString(cursor);
    if (!isWorkday(dateKey)) {
      continue;
    }
    const status = statusByDate.get(dateKey);
    if (isExcluded(status, dateKey)) {
      excludedDates.push({ date: dateKey, status });
      continue;
    }
    countedDays += 1;
  }

  return { estimatedDate: toLocalDateString(cursor), excludedDates };
}
