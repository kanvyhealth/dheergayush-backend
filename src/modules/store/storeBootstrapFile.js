/**
 * Static store snapshots written by scripts/exportStoreBootstrap.js.
 * First paint uses the lean store-bootstrap.json; category pages live in
 * store-bootstrap-pages.json so the client does not download them on /store.
 */
const fs = require('fs');
const path = require('path');
const { CATALOG_PATH } = require('./medicineCatalogJson');
const { toStoreSlug } = require('./storeCategories');

const ROOT = path.join(__dirname, '..', '..', '..');
const BOOTSTRAP_PATH = path.join(ROOT, 'public', 'data', 'store-bootstrap.json');
const PAGES_PATH = path.join(ROOT, 'public', 'data', 'store-bootstrap-pages.json');
const READY_PATH = path.join(ROOT, 'public', 'data', 'store-catalog-ready.json');

let bootstrapMemo = { mtimeMs: 0, size: 0, data: null };
let pagesMemo = { mtimeMs: 0, size: 0, data: null };
let readyMemo = { mtimeMs: 0, size: 0, data: null };

function readJsonIfFresh(filePath, memo) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    if (memo.data && memo.mtimeMs === stat.mtimeMs && memo.size === stat.size) {
      return memo.data;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    memo.mtimeMs = stat.mtimeMs;
    memo.size = stat.size;
    memo.data = data;
    return data;
  } catch (_) {
    return null;
  }
}

function readStoreBootstrap() {
  const data = readJsonIfFresh(BOOTSTRAP_PATH, bootstrapMemo);
  return data && typeof data === 'object' ? data : null;
}

function readStoreBootstrapPages() {
  const data = readJsonIfFresh(PAGES_PATH, pagesMemo);
  return data && typeof data === 'object' ? data : null;
}

function catalogJsonMtimeMs() {
  try {
    return fs.existsSync(CATALOG_PATH) ? fs.statSync(CATALOG_PATH).mtimeMs : 0;
  } catch (_) {
    return 0;
  }
}

function readStoreCatalogReady() {
  const data = readJsonIfFresh(READY_PATH, readyMemo);
  if (!data || !Array.isArray(data.medicines) || !data.medicines.length) return null;
  const catalogMtime = catalogJsonMtimeMs();
  if (catalogMtime && readyMemo.mtimeMs && readyMemo.mtimeMs < catalogMtime) {
    return null;
  }
  return data;
}

function bootstrapPageKey(category, subcategory) {
  const dept = toStoreSlug(category);
  if (!dept) return '';
  const sub = toStoreSlug(subcategory);
  return sub ? `${dept}/${sub}` : dept;
}

function reshapePage(payload, limit) {
  if (!payload || !Array.isArray(payload.items)) return null;
  const total = Number(payload.total) || payload.items.length;
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || payload.limit || 24));
  if (payload.limit === pageLimit) return payload;
  if (pageLimit > payload.items.length && pageLimit > (payload.limit || 0)) return null;
  return {
    ...payload,
    items: payload.items.slice(0, pageLimit),
    limit: pageLimit,
    page: 1,
    pages: Math.ceil(total / pageLimit) || 1
  };
}

function matchBootstrapPage(opts = {}) {
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  if (page !== 1) return null;
  if (opts.q) return null;
  if (opts.company && opts.company !== 'all') return null;

  const hasCat = opts.category && opts.category !== 'all';
  const hasSub = opts.subcategory && opts.subcategory !== 'all';
  let payload = null;
  if (!hasCat && !hasSub) {
    const boot = readStoreBootstrap();
    payload = boot && boot.page1;
  } else {
    const pages = readStoreBootstrapPages();
    if (hasSub && hasCat) {
      const key = bootstrapPageKey(opts.category, opts.subcategory);
      payload = pages && pages.subcategoryPages && pages.subcategoryPages[key];
    } else if (hasCat) {
      const key = bootstrapPageKey(opts.category);
      payload = pages && pages.departmentPages && pages.departmentPages[key];
    }
  }
  return reshapePage(payload, opts.limit);
}

function invalidateStoreBootstrapMemo() {
  bootstrapMemo = { mtimeMs: 0, size: 0, data: null };
  pagesMemo = { mtimeMs: 0, size: 0, data: null };
  readyMemo = { mtimeMs: 0, size: 0, data: null };
}

module.exports = {
  BOOTSTRAP_PATH,
  PAGES_PATH,
  READY_PATH,
  readStoreBootstrap,
  readStoreCatalogReady,
  matchBootstrapPage,
  bootstrapPageKey,
  invalidateStoreBootstrapMemo
};
