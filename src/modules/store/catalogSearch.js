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

/**
 * Build a token → medicine-id set for fast candidate lookup.
 * Tokens come from name/brand/company (not long descriptions).
 */
function buildSearchIndex(medicines) {
  const tokenToIds = new Map();
  const list = Array.isArray(medicines) ? medicines : [];

  list.forEach((medicine) => {
    const id = String(medicine._id || medicine.id || '');
    if (!id) return;
    const text = normalizeText(
      [medicine.name, medicine.brand, medicine.company, medicine.storeName]
        .filter(Boolean)
        .join(' ')
    );
    const tokens = new Set(text.split(' ').filter((t) => t.length >= 2));
    tokens.forEach((token) => {
      if (!tokenToIds.has(token)) tokenToIds.set(token, new Set());
      tokenToIds.get(token).add(id);
      if (token.length >= 3) {
        for (let len = 3; len <= Math.min(token.length, 8); len++) {
          const prefix = token.slice(0, len);
          if (!tokenToIds.has(prefix)) tokenToIds.set(prefix, new Set());
          tokenToIds.get(prefix).add(id);
        }
      }
    });
  });

  return { tokenToIds, size: list.length };
}

const SEARCH_TOKEN_ALIASES = {
  triphala: ['thriphala', 'triphala'],
  thriphala: ['triphala', 'thriphala'],
  churna: ['choorna', 'churnam', 'choornam', 'chooran', 'churna'],
  choorna: ['churna', 'churnam', 'choornam', 'chooran'],
  churnam: ['churna', 'choorna', 'choornam'],
  choornam: ['churna', 'choorna', 'churnam'],
  ashwagandha: ['aswagandha', 'ashwagandha', 'aswagandha'],
  aswagandha: ['ashwagandha', 'aswagandha'],
  arishta: ['arishtam', 'arishta', 'aristham', 'arista'],
  arishtam: ['arishta', 'arishtam', 'arista'],
  asava: ['asavam', 'asav', 'asava'],
  asavam: ['asava', 'asav'],
  guggulu: ['guggul', 'guggulu'],
  guggul: ['guggulu', 'guggul'],
  taila: ['tailam', 'thailam', 'thaila', 'tail'],
  tailam: ['taila', 'thailam', 'thaila'],
  thailam: ['taila', 'tailam', 'thaila'],
  ghrita: ['ghritam', 'ghritham', 'ghrit'],
  ghritam: ['ghrita', 'ghritham', 'ghrit'],
  vati: ['vatika', 'guti', 'gutika', 'gulika'],
  kashayam: ['kashaya', 'kadha', 'kwath'],
  kashaya: ['kashayam', 'kadha'],
  kadha: ['kashayam', 'kashaya', 'kwath']
};

const PACK_QUERY_TOKENS = new Set([
  'ml', 'gm', 'gms', 'g', 'kg', 'mg', 'l', 'ltr', 'litre', 'liter',
  'nos', 'no', 'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps',
  'capsule', 'capsules', 'pack', 'packs', 'strip', 'strips',
  'bottle', 'bottles', 'unit', 'units'
]);

function expandSearchTokens(tokens) {
  const out = new Set();
  (tokens || []).forEach((token) => {
    const t = String(token || '').trim();
    if (!t) return;
    out.add(t);
    const aliases = SEARCH_TOKEN_ALIASES[t];
    if (aliases) aliases.forEach((alias) => out.add(alias));
  });
  return [...out];
}

function meaningfulQueryTokens(query) {
  return normalizeText(query)
    .split(' ')
    .filter((t) => t.length >= 2 && !PACK_QUERY_TOKENS.has(t) && !/^\d+$/.test(t));
}

function lookupTokenBucket(index, token) {
  let bucket = index.tokenToIds.get(token);
  if (bucket && bucket.size) return bucket;
  if (token.length >= 3) {
    bucket = index.tokenToIds.get(token.slice(0, Math.min(token.length, 8)));
  }
  return bucket && bucket.size ? bucket : null;
}

const GENERIC_FORM_TOKENS = new Set([
  'churna', 'choorna', 'churnam', 'choornam', 'chooran',
  'tablet', 'tablets', 'capsule', 'capsules', 'syrup',
  'vati', 'gutika', 'guti', 'oil', 'taila', 'tailam', 'thailam'
]);

function candidateIdsFromIndex(index, query) {
  if (!index || !index.tokenToIds) return null;
  const tokens = meaningfulQueryTokens(query);
  const productTokens = tokens.filter((t) => !GENERIC_FORM_TOKENS.has(t));
  const queryTokens = expandSearchTokens(productTokens.length ? productTokens : tokens);
  if (!queryTokens.length) return null;

  const union = new Set();
  queryTokens.forEach((token) => {
    const bucket = lookupTokenBucket(index, token);
    if (bucket) bucket.forEach((id) => union.add(id));
  });
  return union;
}

function nameContainsQuery(medicine, query) {
  const q = normalizeText(query);
  if (!q) return false;
  const name = normalizeText(medicine && medicine.name);
  const brand = normalizeText((medicine && (medicine.company || medicine.brand || medicine.storeName)) || '');
  if (name.includes(q) || brand.includes(q)) return true;
  const tokens = meaningfulQueryTokens(query);
  if (!tokens.length) return false;
  return tokens.every((token) => {
    const aliases = expandSearchTokens([token]);
    return aliases.some((alias) => name.includes(alias) || brand.includes(alias));
  });
}

function searchMedicines(medicines, query, options = {}) {
  const list = Array.isArray(medicines) ? medicines : [];
  const q = String(query || '').trim();
  const minScore = Number(options.minScore) || DEFAULT_MIN_SCORE;

  if (!q) return list.slice();

  const byId = new Map();
  const add = (medicine) => {
    const id = String((medicine && (medicine._id || medicine.id)) || '');
    if (id) byId.set(id, medicine);
    else byId.set(`row-${byId.size}`, medicine);
  };

  if (q.length >= 2 && options.index) {
    const candidateIds = candidateIdsFromIndex(options.index, q);
    if (candidateIds && candidateIds.size > 0) {
      list.forEach((m) => {
        if (candidateIds.has(String(m._id || m.id || ''))) add(m);
      });
    }
  }
  list.forEach((m) => {
    if (nameContainsQuery(m, q)) add(m);
  });

  const pool = byId.size ? [...byId.values()] : list;

  return pool
    .map((medicine) => ({
      medicine,
      score: nameContainsQuery(medicine, q) ? Math.max(0.96, scoreMedicine(medicine, q)) : scoreMedicine(medicine, q)
    }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const nameCmp = String(a.medicine.name || '').localeCompare(String(b.medicine.name || ''));
      if (nameCmp) return nameCmp;
      return String(a.medicine.company || a.medicine.brand || '')
        .localeCompare(String(b.medicine.company || b.medicine.brand || ''));
    })
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
  buildSearchIndex,
  matchText,
  filterByFields,
  DEFAULT_MIN_SCORE
};
