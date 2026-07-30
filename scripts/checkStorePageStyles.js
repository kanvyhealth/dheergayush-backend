'use strict';

/**
 * Static sanity check for the store page shell: balanced CSS blocks, no orphaned
 * HTML comments, and presence of the elements stores-app.js binds to.
 */

const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'public', 'stores.html');
const APP = path.join(__dirname, '..', 'public', 'js', 'store', 'stores-app.js');

const REQUIRED_IDS = [
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
];

function main() {
  const html = fs.readFileSync(PAGE, 'utf8');
  const app = fs.readFileSync(APP, 'utf8');
  const failures = [];

  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!style) failures.push('no <style> block found');
  else {
    const open = (style[1].match(/\{/g) || []).length;
    const close = (style[1].match(/\}/g) || []).length;
    console.log(`css blocks: ${open} open / ${close} close`);
    if (open !== close) failures.push(`unbalanced css braces (${open} vs ${close})`);
  }

  const openComments = (html.match(/<!--/g) || []).length;
  const closeComments = (html.match(/-->/g) || []).length;
  console.log(`html comments: ${openComments} open / ${closeComments} close`);
  if (openComments !== closeComments) failures.push('unbalanced html comments');

  REQUIRED_IDS.forEach((id) => {
    const inHtml = html.includes(`id="${id}"`);
    const commented = new RegExp(`<!--[\\s\\S]*?id="${id}"[\\s\\S]*?-->`).test(html);
    console.log(`  #${id}: ${inHtml ? 'present' : 'MISSING'}${commented ? ' (COMMENTED OUT)' : ''}`);
    if (!inHtml) failures.push(`#${id} missing from stores.html`);
    if (commented) failures.push(`#${id} is inside an HTML comment`);
  });

  const classesUsedByApp = ['filter-link', 'filter-sublink', 'filter-group', 'filter-count', 'filter-label', 'store-chip', 'chip-count'];
  classesUsedByApp.forEach((cls) => {
    if (!app.includes(cls)) return;
    if (!html.includes(`.${cls}`)) failures.push(`class .${cls} emitted by stores-app.js has no style rule`);
  });

  if (failures.length) {
    console.error('\nFAIL');
    failures.forEach((f) => console.error(' - ' + f));
    process.exit(1);
  }
  console.log('\nOK');
}

main();
