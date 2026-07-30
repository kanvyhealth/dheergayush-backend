'use strict';

/**
 * Loads the store page from several URL depths and resolves every stylesheet and
 * script the way a browser would, so nested /store/:category/:subcategory URLs
 * cannot silently lose their CSS or JS.
 *
 * Usage: node scripts/verifyStorePageAssets.js [baseUrl] [pagePath...]
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE = process.argv[2] || 'http://127.0.0.1:3013';

const DEFAULT_PAGE_PATHS = [
  '/store',
  '/store/organic-foods',
  '/store/organic-foods/honey',
  '/store/organic-foods/nuts-and-dry-fruits',
  '/store/ayurvedic-medicines',
  '/product-details.html?id=sn-0001'
];

const PAGE_PATHS = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_PAGE_PATHS;

function request(url) {
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    client.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    }).on('error', reject);
  });
}

function extractAssets(html) {
  const assets = [];
  const linkRe = /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g;
  const scriptRe = /<script[^>]+src="([^"]+)"/g;
  let m;
  while ((m = linkRe.exec(html))) assets.push({ kind: 'css', url: m[1] });
  while ((m = scriptRe.exec(html))) assets.push({ kind: 'js', url: m[1] });
  return assets;
}

function expectedType(kind) {
  return kind === 'css' ? 'css' : 'javascript';
}

(async () => {
  let failures = 0;
  for (const pagePath of PAGE_PATHS) {
    const pageUrl = new URL(pagePath, BASE).href;
    const page = await request(pageUrl);
    console.log(`\n${pagePath}  ->  ${page.status}`);
    if (page.status !== 200) { failures += 1; continue; }

    const assets = extractAssets(page.body).filter((a) => !/^https?:/i.test(a.url));
    for (const asset of assets) {
      const resolved = new URL(asset.url, pageUrl).href;
      const res = await request(resolved);
      const typeOk = res.type.includes(expectedType(asset.kind));
      const ok = res.status === 200 && typeOk;
      if (!ok) failures += 1;
      console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${String(res.status)} ${(res.type.split(';')[0] || '-').padEnd(24)} ${resolved.replace(BASE, '')}`);
    }
    console.log(`   ${assets.length} local assets checked`);
  }

  console.log(failures ? `\nFAIL: ${failures} problem(s)` : '\nOK: every store URL resolves all of its assets');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
