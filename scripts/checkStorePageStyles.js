'use strict';

/**
 * Static sanity check for the store front-end pages: balanced CSS blocks, no
 * orphaned HTML comments, every element a page script looks up exists, and every
 * class a script emits has a style rule somewhere the page loads.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'public', 'css');

const PAGES = [
  {
    html: 'public/stores.html',
    scripts: ['public/js/store/stores-app.js'],
    requiredIds: [
      'departmentFilters',
      'subcategoryStripWrap',
      'subcategoryStrip',
      'mobileFilterToggle',
      'filtersSidebar',
      'productGrid',
      'productCount',
      'loadSentinel',
      'storesStrip',
      'breadcrumb'
    ],
    classPrefixes: ['filter-', 'product-', 'store-', 'subcategory-', 'pack-', 'chip-']
  },
  {
    html: 'public/product-details.html',
    scripts: ['public/js/store/dg-product-details.js'],
    requiredIds: ['pdRoot', 'pdCrumb', 'pdRecsSection', 'pdRecs', 'pdSticky', 'pdStickyPrice', 'pdStickyAdd', 'cartAddedToast', 'cartBadge'],
    classPrefixes: ['pd-']
  }
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function allCss() {
  return fs.readdirSync(CSS_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8'))
    .join('\n');
}

function matchAll(text, re) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

function checkPage(page, sharedCss, failures) {
  const html = read(page.html);
  const scripts = page.scripts.map(read).join('\n');
  console.log(`\n${page.html}`);

  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!style) {
    failures.push(`${page.html}: no <style> block`);
    return;
  }
  const open = (style[1].match(/\{/g) || []).length;
  const close = (style[1].match(/\}/g) || []).length;
  console.log(`  css blocks: ${open} open / ${close} close`);
  if (open !== close) failures.push(`${page.html}: unbalanced css braces (${open} vs ${close})`);

  const openComments = (html.match(/<!--/g) || []).length;
  const closeComments = (html.match(/-->/g) || []).length;
  if (openComments !== closeComments) failures.push(`${page.html}: unbalanced html comments`);

  page.requiredIds.forEach((id) => {
    if (!html.includes(`id="${id}"`)) failures.push(`${page.html}: #${id} missing`);
    if (new RegExp(`<!--[\\s\\S]*?id="${id}"[\\s\\S]*?-->`).test(html)) {
      failures.push(`${page.html}: #${id} is inside an HTML comment`);
    }
  });

  // Elements the script looks up must exist in the page or be built by the script.
  const lookups = [...new Set(matchAll(scripts, /getElementById\(['"]([^'"]+)['"]\)/g))];
  const missing = lookups.filter((id) => !html.includes(`id="${id}"`) && !scripts.includes(`id="${id}"`));
  console.log(`  element lookups: ${lookups.length} checked, ${missing.length} unresolved`);
  missing.forEach((id) => failures.push(`${page.html}: script looks up #${id} which nothing creates`));

  // Classes emitted by the script need a rule in the page style or a loaded stylesheet.
  const styleSheet = style[1] + sharedCss;
  const emitted = new Set();
  matchAll(scripts, /class="([^"'`]+)"/g).forEach((value) => {
    value.split(/\s+/).forEach((token) => {
      if (!token || token.indexOf('+') >= 0) return;
      if (page.classPrefixes.some((prefix) => token.startsWith(prefix))) emitted.add(token);
    });
  });
  const unstyled = [...emitted].filter((token) => !styleSheet.includes(`.${token}`));
  console.log(`  emitted classes: ${emitted.size} checked, ${unstyled.length} unstyled`);
  unstyled.forEach((token) => failures.push(`${page.html}: class .${token} has no style rule`));
}

function main() {
  const sharedCss = allCss();
  const failures = [];
  PAGES.forEach((page) => checkPage(page, sharedCss, failures));

  if (failures.length) {
    console.error('\nFAIL');
    failures.forEach((f) => console.error(' - ' + f));
    process.exit(1);
  }
  console.log('\nOK');
}

main();
