/**
 * Client-side fuzzy search (mirrors lib/catalogSearch.js for legacy JSON fallbacks).
 */
(function (global) {
  'use strict';

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    var left = String(a || '');
    var right = String(b || '');
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    var row = new Array(right.length + 1);
    var i;
    var j;
    for (i = 0; i <= right.length; i++) row[i] = i;
    for (i = 1; i <= left.length; i++) {
      var prev = i - 1;
      row[0] = i;
      for (j = 1; j <= right.length; j++) {
        var temp = row[j];
        var cost = left[i - 1] === right[j - 1] ? 0 : 1;
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
        prev = temp;
      }
    }
    return row[right.length];
  }

  function scoreToken(queryToken, fieldToken) {
    var q = String(queryToken || '').trim();
    var f = String(fieldToken || '').trim();
    if (!q || !f) return 0;
    if (f === q) return 1;
    if (f.indexOf(q) >= 0) return 0.95;
    if (q.length >= 3 && f.indexOf(q.slice(0, 3)) === 0) return 0.8;
    var dist = levenshtein(q, f);
    var maxLen = Math.max(q.length, f.length);
    if (!maxLen) return 0;
    var similarity = 1 - dist / maxLen;
    if (similarity >= 0.72) return similarity * 0.88;
    if (q.length >= 4 && f.length >= 4 && similarity >= 0.62) return similarity * 0.7;
    return 0;
  }

  function bestTokenScore(queryToken, tokens, fullText) {
    var best = 0;
    for (var i = 0; i < tokens.length; i++) {
      best = Math.max(best, scoreToken(queryToken, tokens[i]));
    }
    var q = String(queryToken || '');
    var text = String(fullText || '');
    if (best < 0.55 && q.length >= 3 && text.length >= q.length) {
      for (var pos = 0; pos <= text.length - q.length; pos++) {
        var chunk = text.slice(pos, pos + q.length);
        var dist = levenshtein(q, chunk);
        var sim = 1 - dist / Math.max(q.length, chunk.length);
        if (sim >= 0.68) best = Math.max(best, sim * 0.82);
      }
    }
    return best;
  }

  function scoreMedicine(medicine, query) {
    var q = normalizeText(query);
    if (!q) return 1;
    var name = normalizeText(medicine.name);
    var description = normalizeText(medicine.description);
    var company = normalizeText(medicine.company || medicine.storeName || medicine.brand);
    var haystack = [name, description, company].filter(Boolean).join(' ');
    if (haystack.indexOf(q) >= 0) return 1;
    if (name.indexOf(q) >= 0) return 0.96;
    if (company.indexOf(q) >= 0) return 0.9;
    var queryTokens = q.split(' ').filter(Boolean);
    var fieldTokens = haystack.split(' ').filter(Boolean);
    if (!queryTokens.length) return 0;
    var total = 0;
    for (var i = 0; i < queryTokens.length; i++) {
      total += bestTokenScore(queryTokens[i], fieldTokens, haystack);
    }
    return total / queryTokens.length;
  }

  var DEFAULT_MIN_SCORE = 0.42;

  function searchMedicines(medicines, query, options) {
    var list = Array.isArray(medicines) ? medicines : [];
    var q = String(query || '').trim();
    var minScore = (options && options.minScore) || DEFAULT_MIN_SCORE;
    if (!q) return list.slice();
    return list
      .map(function (medicine) {
        return { medicine: medicine, score: scoreMedicine(medicine, q) };
      })
      .filter(function (row) { return row.score >= minScore; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (row) { return row.medicine; });
  }

  function matchText(haystack, query, minScore) {
    var q = normalizeText(query);
    if (!q) return true;
    var text = normalizeText(haystack);
    if (!text) return false;
    if (text.indexOf(q) >= 0) return true;
    var tokens = text.split(' ').filter(Boolean);
    var queryTokens = q.split(' ').filter(Boolean);
    if (!queryTokens.length) return false;
    var score = 0;
    for (var i = 0; i < queryTokens.length; i++) {
      score += bestTokenScore(queryTokens[i], tokens, text);
    }
    score /= queryTokens.length;
    return score >= (minScore == null ? 0.5 : minScore);
  }

  function filterByFields(items, query, fields, minScore) {
    var q = String(query || '').trim();
    if (!q) return (items || []).slice();
    return (items || []).filter(function (item) {
      var haystack = (fields || [])
        .map(function (field) { return item[field]; })
        .filter(function (value) { return value != null && String(value).trim() !== ''; })
        .join(' ');
      return matchText(haystack, q, minScore);
    });
  }

  global.DgFuzzySearch = {
    normalizeText: normalizeText,
    scoreMedicine: scoreMedicine,
    searchMedicines: searchMedicines,
    matchText: matchText,
    filterByFields: filterByFields,
    DEFAULT_MIN_SCORE: DEFAULT_MIN_SCORE
  };
})(typeof window !== 'undefined' ? window : globalThis);
