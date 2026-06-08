const { resolveFileUrl } = require('./firebaseStorage');

function toReportEntry(reportStr, fallbackDate) {
  const reportStrNorm = String(reportStr || '').trim();
  if (!reportStrNorm) return null;
  const isUrl = /^https?:\/\//i.test(reportStrNorm);
  const filename = isUrl
    ? (reportStrNorm.split('/').pop()?.split('?')[0] || 'report')
    : reportStrNorm.split(/[\\/]/).pop() || 'report';
  return {
    filename,
    path: filename,
    fullPath: isUrl ? reportStrNorm : '/uploads/' + filename,
    uploadDate: fallbackDate || new Date(),
    _raw: reportStrNorm
  };
}

async function resolveReportEntries(reports, fallbackDate) {
  const entries = (Array.isArray(reports) ? reports : [])
    .map((r) => toReportEntry(r, fallbackDate))
    .filter(Boolean);
  for (const entry of entries) {
    if (!/^https?:\/\//i.test(entry.fullPath)) {
      const resolved = await resolveFileUrl(entry._raw);
      if (resolved) entry.fullPath = resolved;
    }
    delete entry._raw;
  }
  return entries.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
}

module.exports = { toReportEntry, resolveReportEntries };
