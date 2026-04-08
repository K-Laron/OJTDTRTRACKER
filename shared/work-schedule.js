export const FOUR_DAY_WORKWEEK_START = '2026-03-09';

function getDayOfWeek(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

export function isFourDayWorkweekFriday(dateString = '') {
  return Boolean(dateString)
    && dateString >= FOUR_DAY_WORKWEEK_START
    && getDayOfWeek(dateString) === 5;
}

export function isScheduledWorkday(dateString = '') {
  const day = getDayOfWeek(dateString);
  if (day === 0 || day === 6) return false;
  if (isFourDayWorkweekFriday(dateString)) return false;
  return true;
}

export function getScheduledNonWorkingStatus(dateString = '') {
  return isFourDayWorkweekFriday(dateString) ? 'no_ojt' : '';
}
