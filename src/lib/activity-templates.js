export const DEFAULT_ACTIVITY_TEMPLATES = [
  { id: 'template-documentation', name: 'Documentation', activities: 'Updated documentation and organized work output.', remarks: '' },
  { id: 'template-testing', name: 'Testing', activities: 'Tested implemented features and validated expected behavior.', remarks: '' },
  { id: 'template-development', name: 'Development', activities: 'Implemented assigned tasks and reviewed related code changes.', remarks: '' },
];

export function getActivityTemplates() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('dtr_activity_templates') || 'null');
  } catch {
    saved = null;
  }
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_ACTIVITY_TEMPLATES;
}

export function saveActivityTemplate(template) {
  const templates = getActivityTemplates().filter(item => item.id !== template.id);
  templates.unshift({
    id: template.id || crypto.randomUUID(),
    name: String(template.name || '').trim(),
    activities: String(template.activities || '').trim(),
    remarks: String(template.remarks || '').trim(),
  });
  localStorage.setItem('dtr_activity_templates', JSON.stringify(templates.slice(0, 20)));
  return getActivityTemplates();
}

export function deleteActivityTemplate(id) {
  const templates = getActivityTemplates().filter(item => item.id !== id);
  localStorage.setItem('dtr_activity_templates', JSON.stringify(templates));
  return templates;
}
