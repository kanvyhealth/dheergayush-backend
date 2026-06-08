/**
 * Download missing Shree Dhootapapeshwar product images (run after syncSdplFromPriceList.js).
 */
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'medicine-catalog.json');
const IMAGE_DIR = path.join(ROOT, 'medicine', 'medicine');
const LIMIT = Number(process.env.LIMIT || 0);

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(name) {
  return normalizeName(name).replace(/\s+/g, '-');
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
          res.resume();
          resolve(fetchUrl(new URL(res.headers.location, url).toString(), redirects + 1));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('timeout')));
  });
}

function pickBestImage(html) {
  const candidates = [];
  const og = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) candidates.push(og[1]);
  const jsonLd = html.match(/"image"\s*:\s*"([^"]+)"/gi) || [];
  jsonLd.forEach((m) => {
    const u = m.match(/"([^"]+\.(?:jpg|jpeg|png|webp))"/i);
    if (u) candidates.push(u[1]);
  });
  const all = html.match(/https:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/gi) || [];
  all.forEach((u) => candidates.push(u));
  return candidates.find(
    (u) =>
      u &&
      !/logo|favicon|icon|banner|sprite|placeholder|wordmark|avatar|profile|social/i.test(u) &&
      !/250x250.*Social/i.test(u),
  );
}

async function search1mg(name) {
  const q = encodeURIComponent(`Dhootapapeshwar ${name}`);
  const res = await fetchUrl(`https://www.1mg.com/search/all?name=${q}`);
  if (res.status !== 200) return null;
  const html = res.body.toString('utf8');
  const link = html.match(/href="(\/drugs\/[^"?]+)"/i) || html.match(/href="(\/otc\/[^"?]+)"/i);
  if (link) {
    const page = await fetchUrl(`https://www.1mg.com${link[1]}`);
    if (page.status === 200) {
      const img = pickBestImage(page.body.toString('utf8'));
      if (img) return img.replace(/&amp;/g, '&');
    }
  }
  return pickBestImage(html);
}

async function searchTruemeds(name) {
  const slug = slugify(`dhootapapeshwar ${name}`);
  const res = await fetchUrl(`https://www.truemeds.in/search/${encodeURIComponent(`Dhootapapeshwar ${name}`)}`);
  if (res.status !== 200) return null;
  const html = res.body.toString('utf8');
  const link = html.match(/href="(\/medicine\/[^"?]+)"/i);
  if (link) {
    const page = await fetchUrl(`https://www.truemeds.in${link[1]}`);
    if (page.status === 200) {
      const img = pickBestImage(page.body.toString('utf8'));
      if (img) return img;
    }
  }
  return pickBestImage(html);
}

async function downloadImage(url, destPath) {
  const res = await fetchUrl(url);
  if (res.status !== 200 || res.body.length < 800) throw new Error(`bad response ${res.status}`);
  fs.writeFileSync(destPath, res.body);
}

async function resolveImage(name) {
  const sources = [search1mg, searchTruemeds];
  for (const fn of sources) {
    try {
      const url = await fn(name);
      if (url) return url;
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const store = catalog.find((s) => /dhootapapeshwar/i.test(s.name || ''));
  if (!store) throw new Error('SDPL store missing');

  const missing = store.medicines.filter((m) => {
    const p = path.join(IMAGE_DIR, m.imageFile || '');
    return !m.imageFile || !fs.existsSync(p);
  });

  console.log('Missing images:', missing.length);
  let done = 0;
  let ok = 0;

  for (const med of missing) {
    if (LIMIT > 0 && done >= LIMIT) break;
    done++;
    const dest = path.join(IMAGE_DIR, med.imageFile || `${med._id}.jpg`);
    process.stdout.write(`[${done}/${missing.length}] ${med.name} ... `);
    try {
      const url = await resolveImage(med.name);
      if (!url) {
        console.log('not found');
        continue;
      }
      await downloadImage(url, dest);
      ok++;
      console.log('ok');
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.log('fail', err.message);
    }
  }

  console.log(`Downloaded ${ok} / ${done} attempted`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
