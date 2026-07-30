#!/usr/bin/env node
/**
 * Resolves key layout properties per device viewport by replaying the CSS
 * cascade (load order + !important + specificity) over the site stylesheets
 * and the page-level <style> blocks, then asserts the device tiers defined in
 * public/css/dg-responsive.css produce the intended layout.
 *
 * Usage: node scripts/checkResponsiveTiers.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Stylesheets in the order stores.html / product-details.html load them. */
const SHEETS = [
  'public/css/dheergayush-theme.css',
  'public/css/dheergayush-forms.css',
  'public/css/dg-responsive.css',
  'public/css/dg-store-responsive.css'
];

const PAGES = ['public/stores.html', 'public/product-details.html'];

const DEVICES = [
  { label: 'fold cover', width: 280, height: 653 },
  { label: 'iPhone SE 1', width: 320, height: 568 },
  { label: 'small android', width: 360, height: 740 },
  { label: 'iPhone 12 mini', width: 375, height: 812 },
  { label: 'Pixel 7', width: 412, height: 915 },
  { label: 'iPhone Pro Max', width: 430, height: 932 },
  { label: 'large mobile', width: 540, height: 960 },
  { label: 'phone landscape', width: 915, height: 412 },
  { label: 'tablet portrait', width: 768, height: 1024 },
  { label: 'tablet landscape', width: 1024, height: 768 },
  { label: 'laptop', width: 1280, height: 800 },
  { label: 'laptop hidpi', width: 1366, height: 768 },
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'desktop wide', width: 1680, height: 1050 },
  { label: 'full-HD TV', width: 1920, height: 1080 },
  { label: 'QHD TV', width: 2560, height: 1440 },
  { label: '4K TV', width: 3840, height: 2160 }
];

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Flattens a stylesheet into { selector, media, prop, value, important, order }. */
function parseSheet(css, sourceIndex, out) {
  const walk = (body, media) => {
    let i = 0;
    let buffer = '';

    while (i < body.length) {
      const ch = body[i];

      if (ch === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < body.length && depth > 0) {
          if (body[j] === '{') depth += 1;
          else if (body[j] === '}') depth -= 1;
          j += 1;
        }
        const prelude = buffer.trim();
        const inner = body.slice(i + 1, j - 1);

        if (prelude.startsWith('@media')) {
          walk(inner, media.concat(prelude.slice(6).trim()));
        } else if (prelude.startsWith('@')) {
          /* @supports / @keyframes etc. are not part of these assertions. */
        } else {
          for (const selector of prelude.split(',')) {
            const sel = selector.trim();
            if (!sel) continue;
            for (const decl of inner.split(';')) {
              const idx = decl.indexOf(':');
              if (idx < 0) continue;
              const prop = decl.slice(0, idx).trim().toLowerCase();
              let value = decl.slice(idx + 1).trim();
              if (!prop || !value) continue;
              const important = /!important$/i.test(value);
              if (important) value = value.replace(/!important$/i, '').trim();
              out.push({
                selector: sel,
                media,
                prop,
                value,
                important,
                order: out.length,
                sourceIndex
              });
            }
          }
        }

        buffer = '';
        i = j;
        continue;
      }

      buffer += ch;
      i += 1;
    }
  };

  walk(stripComments(css), []);
  return out;
}

function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const elements = (
    selector
      .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+(\([^)]*\))?/g, ' ')
      .match(/[a-zA-Z][\w-]*/g) || []
  ).length;
  return ids * 10000 + classes * 100 + elements;
}

function mediaMatches(conditions, device) {
  return conditions.every((condition) => {
    const text = condition.toLowerCase();

    for (const [, value] of text.matchAll(/min-width:\s*(\d+)px/g)) {
      if (device.width < Number(value)) return false;
    }
    for (const [, value] of text.matchAll(/max-width:\s*(\d+)px/g)) {
      if (device.width > Number(value)) return false;
    }
    for (const [, value] of text.matchAll(/min-height:\s*(\d+)px/g)) {
      if (device.height < Number(value)) return false;
    }
    for (const [, value] of text.matchAll(/max-height:\s*(\d+)px/g)) {
      if (device.height > Number(value)) return false;
    }
    if (text.includes('orientation: landscape') && device.width <= device.height) return false;
    if (text.includes('orientation: portrait') && device.width > device.height) return false;

    return true;
  });
}

function resolve(rules, selector, prop, device, fallback) {
  let winner = null;

  for (const rule of rules) {
    if (rule.prop !== prop) continue;
    if (rule.selector !== selector) continue;
    if (!mediaMatches(rule.media, device)) continue;

    if (
      !winner ||
      (rule.important && !winner.important) ||
      (rule.important === winner.important &&
        specificity(rule.selector) >= specificity(winner.selector))
    ) {
      winner = rule;
    }
  }

  return winner ? winner.value : fallback;
}

/** Resolves a property when several selectors can style the same element. */
function resolveAny(rules, selectors, prop, device, fallback) {
  let best = fallback;
  let bestRule = null;

  for (const selector of selectors) {
    for (const rule of rules) {
      if (rule.prop !== prop || rule.selector !== selector) continue;
      if (!mediaMatches(rule.media, device)) continue;
      if (
        !bestRule ||
        (rule.important && !bestRule.important) ||
        (rule.important === bestRule.important &&
          specificity(rule.selector) >= specificity(bestRule.selector))
      ) {
        bestRule = rule;
        best = rule.value;
      }
    }
  }

  return best;
}

function columnsOf(value) {
  if (!value) return null;
  const repeat = value.match(/repeat\(\s*(\d+)\s*,/);
  if (repeat) return Number(repeat[1]);
  if (/auto-fill|auto-fit/.test(value)) {
    const min = value.match(/minmax\(\s*(?:min\([^)]*?(\d+)px[^)]*\)|(\d+)px)/);
    return `auto/${min ? min[1] || min[2] : '?'}px`;
  }
  if (value.trim() === '1fr') return 1;
  return value;
}

function expectedGridColumns(width) {
  if (width <= 300) return 1;
  if (width <= 767) return 2;
  if (width <= 1024) return 3;
  if (width <= 1439) return 'auto/200px';
  if (width <= 1919) return 'auto/240px';
  if (width <= 2559) return 'auto/300px';
  return 'auto/360px';
}

function expectedRootFont(width) {
  if (width <= 360) return '15px';
  if (width >= 2560) return '19px';
  if (width >= 1920) return '17px';
  return '16px (default)';
}

function expectedShellWidth(width) {
  if (width >= 2560) return '2200px';
  if (width >= 1920) return '1760px';
  if (width >= 1440) return '1560px';
  return '1400px';
}

function main() {
  const rules = [];
  let sourceIndex = 0;

  for (const sheet of SHEETS) {
    const file = path.join(ROOT, sheet);
    if (!fs.existsSync(file)) {
      console.error(`Missing stylesheet: ${sheet}`);
      process.exit(1);
    }
    parseSheet(fs.readFileSync(file, 'utf8'), sourceIndex++, rules);
  }

  /* Page-level <style> blocks win ties against the linked stylesheets. */
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      parseSheet(css, sourceIndex++, rules);
    }
  }

  const failures = [];
  const rows = [];

  for (const device of DEVICES) {
    const grid = columnsOf(
      resolve(rules, '.product-grid', 'grid-template-columns', device, null)
    );
    const rootFont = resolve(rules, 'html', 'font-size', device, '16px (default)');
    const shell = resolveAny(
      rules,
      ['.shop-layout', '.store-hero', '.dg-nav-inner'],
      'max-width',
      device,
      null
    );

    const expected = {
      grid: expectedGridColumns(device.width),
      rootFont: expectedRootFont(device.width),
      shell: expectedShellWidth(device.width)
    };

    const actual = { grid, rootFont, shell };

    for (const key of Object.keys(expected)) {
      if (String(actual[key]) !== String(expected[key])) {
        failures.push(
          `${device.label} (${device.width}x${device.height}): ${key} = ${actual[key]}, expected ${expected[key]}`
        );
      }
    }

    rows.push({
      device: `${device.label} ${device.width}x${device.height}`,
      'product grid': String(grid),
      'root font': rootFont,
      'shell max-width': String(shell)
    });
  }

  /* Phones must keep 16px form controls or iOS zooms in on focus. */
  const phone = { label: 'phone', width: 390, height: 844 };
  const inputFont = resolve(rules, 'select', 'font-size', phone, null);
  if (!inputFont || !inputFont.includes('16px')) {
    failures.push(`phone form controls resolve to ${inputFont} (expected a 16px floor)`);
  }

  /* Short landscape viewports must not let the sticky sidebar exceed the screen. */
  const landscape = { label: 'landscape', width: 844, height: 390 };
  const sidebar = resolve(rules, '.filters-sidebar', 'max-height', landscape, null);
  if (!sidebar || !sidebar.includes('76px')) {
    failures.push(`landscape sidebar max-height is ${sidebar} (expected the short-viewport value)`);
  }

  console.table(rows);
  console.log(`phone form control font-size: ${inputFont}`);
  console.log(`short-landscape .filters-sidebar max-height: ${sidebar}`);

  if (failures.length) {
    console.error(`\n${failures.length} responsive tier check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('\nAll responsive tier checks passed.');
}

main();
