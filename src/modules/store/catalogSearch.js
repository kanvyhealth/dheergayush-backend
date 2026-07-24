/**
 * Fuzzy product search — tolerates typos and near-matches on name, description, brand.
 */

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const row = new Array(right.length + 1);
  for (let i = 0; i <= right.length; i++) row[i] = i;

  for (let i = 1; i <= left.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const temp = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[right.length];
}

function scoreToken(queryToken, fieldToken) {
  const q = String(queryToken || '').trim();
  const f = String(fieldToken || '').trim();
  if (!q || !f) return 0;
  if (f === q) return 1;
  if (f.includes(q)) return 0.95;
  if (q.length >= 3 && f.startsWith(q.slice(0, 3))) return 0.8;

  const dist = levenshtein(q, f);
  const maxLen = Math.max(q.length, f.length);
  if (!maxLen) return 0;
  const similarity = 1 - dist / maxLen;
  if (similarity >= 0.72) return similarity * 0.88;
  if (q.length >= 4 && f.length >= 4 && similarity >= 0.62) return similarity * 0.7;
  return 0;
}

function bestTokenScore(queryToken, tokens, fullText) {
  let best = 0;
  for (const token of tokens) {
    best = Math.max(best, scoreToken(queryToken, token));
  }

  const q = String(queryToken || '');
  const text = String(fullText || '');
  if (best < 0.55 && q.length >= 3 && text.length >= q.length) {
    for (let i = 0; i <= text.length - q.length; i++) {
      const chunk = text.slice(i, i + q.length);
      const dist = levenshtein(q, chunk);
      const sim = 1 - dist / Math.max(q.length, chunk.length);
      if (sim >= 0.68) best = Math.max(best, sim * 0.82);
    }
  }
  return best;
}

function scoreMedicine(medicine, query) {
  const q = normalizeText(query);
  if (!q) return 1;

  const name = normalizeText(medicine.name);
  const description = normalizeText(medicine.description);
  const company = normalizeText(medicine.company || medicine.storeName || medicine.brand);
  const haystack = [name, description, company].filter(Boolean).join(' ');

  if (haystack.includes(q)) return 1;
  if (name.includes(q)) return 0.96;
  if (company.includes(q)) return 0.9;

  const queryTokens = q.split(' ').filter(Boolean);
  const fieldTokens = haystack.split(' ').filter(Boolean);
  if (!queryTokens.length) return 0;

  let total = 0;
  for (const token of queryTokens) {
    total += bestTokenScore(token, fieldTokens, haystack);
  }
  return total / queryTokens.length;
}

const DEFAULT_MIN_SCORE = 0.42;

function searchMedicines(medicines, query, options = {}) {
  const list = Array.isArray(medicines) ? medicines : [];
  const q = String(query || '').trim();
  const minScore = Number(options.minScore) || DEFAULT_MIN_SCORE;

  if (!q) return list.slice();

  return list
    .map((medicine) => ({ medicine, score: scoreMedicine(medicine, q) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.medicine);
}

function matchText(haystack, query, minScore = 0.5) {
  const q = normalizeText(query);
  if (!q) return true;
  const text = normalizeText(haystack);
  if (!text) return false;
  if (text.includes(q)) return true;
  const tokens = text.split(' ').filter(Boolean);
  const queryTokens = q.split(' ').filter(Boolean);
  if (!queryTokens.length) return false;
  const score = queryTokens.reduce((sum, token) => sum + bestTokenScore(token, tokens, text), 0)
    / queryTokens.length;
  return score >= minScore;
}

function filterByFields(items, query, fields, minScore = 0.5) {
  const q = String(query || '').trim();
  if (!q) return (items || []).slice();
  return (items || []).filter((item) => {
    const haystack = (fields || [])
      .map((field) => item[field])
      .filter((value) => value != null && String(value).trim() !== '')
      .join(' ');
    return matchText(haystack, q, minScore);
  });
}

module.exports = {
  normalizeText,
  scoreMedicine,
  searchMedicines,
  matchText,
  filterByFields,
  DEFAULT_MIN_SCORE
};
