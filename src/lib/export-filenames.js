const FALLBACK_PROFILE_SEGMENT = 'OJT_Trainee';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function sanitizeSegment(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function buildOwnerPrefix(profileName, username) {
  const profileSegment = sanitizeSegment(profileName, FALLBACK_PROFILE_SEGMENT);
  const usernameSegment = sanitizeSegment(username, '');
  return usernameSegment ? `${profileSegment}_${usernameSegment}` : profileSegment;
}

export function buildDTRExportFilename({ profileName, username, month, year, exportedDate, extension }) {
  const ownerPrefix = buildOwnerPrefix(profileName, username);
  const monthSegment = sanitizeSegment(MONTHS[month], 'Month');
  const yearSegment = sanitizeSegment(year, 'Year');
  const dateSegment = sanitizeSegment(exportedDate, 'export-date');
  const extSegment = sanitizeSegment(String(extension || '').replace(/^\./, ''), 'txt');
  return `${ownerPrefix}_DTR_${monthSegment}_${yearSegment}_exported_${dateSegment}.${extSegment}`;
}

export function buildJsonExportFilename({ profileName, username, exportedDate }) {
  const ownerPrefix = buildOwnerPrefix(profileName, username);
  const dateSegment = sanitizeSegment(exportedDate, 'export-date');
  return `${ownerPrefix}_OJT_DTR_Backup_exported_${dateSegment}.json`;
}
