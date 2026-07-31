/**
 * Extra image sources for missing catalog products:
 * - DuckDuckGo Images
 * - Bing Images (og/thumbnail scrape)
 * - Brand name aliases (e.g. Doodhpateshwar → Dhootapapeshwar)
 */
const { fetchUrl, isBadImageUrl } = (() => {
  // Re-import only fetchUrl; isBadImageUrl is not exported — duplicate thin helper.
  const utils = require('./catalogBrandUtils');
  return {
    fetchUrl: utils.fetchUrl,
    isBadImageUrl(url) {
      const u = String(url || '').toLowerCase();
      return (
        !u ||
        /logo|favicon|icon|banner|sprite|placeholder|wordmark|avatar|profile|social|footer|trust|certified|badge|payment|wallet|app-store|play-store|navv|map-pin|phone\.png|mail\.png|sprite|pixel|1x1|blank/i.test(
          u
        )
      );
    },
  };
})();

const BRAND_ALIASES = {
  doodhpateshwar: ['Dhootapapeshwar', 'Shree Dhootapapeshwar', 'SDPL'],
  'shree doodhpateshwar': ['Dhootapapeshwar', 'Shree Dhootapapeshwar'],
  sdpl: ['Dhootapapeshwar', 'Shree Dhootapapeshwar'],
};

function searchBrandNames(brand) {
  const key = String(brand || '').trim().toLowerCase();
  const aliases = BRAND_ALIASES[key] || [];
  return [...new Set([brand, ...aliases].filter(Boolean))];
}

function extractVqd(html) {
  const patterns = [
    /vqd=["']([^"']+)["']/i,
    /vqd=([^&"']+)/i,
    /"vqd"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

function scoreImageCandidate(url, title, brand, name) {
  const u = String(url || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  const b = String(brand || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (isBadImageUrl(u)) return 0;
  if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) && !/cdn|dam|images|media|product/i.test(u)) {
    return 0.1;
  }
  let score = 0.3;
  const tokens = n.split(/\s+/).filter((x) => x.length > 2);
  let hits = 0;
  tokens.forEach((tok) => {
    if (t.includes(tok) || u.includes(tok.replace(/\s+/g, '-'))) hits++;
  });
  if (tokens.length) score += hits / tokens.length;
  if (b && (t.includes(b) || u.includes(b.replace(/\s+/g, '-')))) score += 0.25;
  if (/pharmeasy|1mg|netmeds|truemeds|apollopharmacy|amazon|flipkart|dabur|baidyanath|dhootapapeshwar/i.test(u)) {
    score += 0.2;
  }
  return score;
}

async function searchDuckDuckGoImages(brand, name) {
  const query = `${brand} ${name} ayurvedic product`;
  const home = await fetchUrl(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`);
  if (home.status !== 200) return null;
  const html = home.body.toString('utf8');
  const vqd = extractVqd(html);
  if (!vqd) return null;

  const api =
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}` +
    `&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`;
  const res = await fetchUrl(api);
  if (res.status !== 200) return null;

  let data;
  try {
    data = JSON.parse(res.body.toString('utf8'));
  } catch (_) {
    return null;
  }

  let best = null;
  let bestScore = 0.55;
  for (const item of data.results || []) {
    const image = item.image || item.thumbnail;
    const score = scoreImageCandidate(image, item.title, brand, name);
    if (score > bestScore) {
      bestScore = score;
      best = String(image).split('?')[0];
    }
  }
  return best;
}

async function searchBingImages(brand, name) {
  const query = `${brand} ${name} ayurvedic`;
  const res = await fetchUrl(
    `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=+filterui:photo-photo&form=IRFLTR`
  );
  if (res.status !== 200) return null;
  const html = res.body.toString('utf8');

  const murl = [...html.matchAll(/murl&quot;:&quot;([^&]+)&quot;/gi)].map((m) =>
    decodeURIComponent(m[1].replace(/\\u0026/g, '&'))
  );
  const direct =
    html.match(/https:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi) || [];
  const candidates = [...murl, ...direct];

  let best = null;
  let bestScore = 0.55;
  for (const url of candidates) {
    const cleaned = String(url).replace(/&amp;/g, '&').split('?')[0];
    const score = scoreImageCandidate(cleaned, '', brand, name);
    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }
  return best;
}

async function resolveImageWithWebFallback(resolveImageOnline, brand, name) {
  const brands = searchBrandNames(brand);
  for (const b of brands) {
    try {
      const url = await resolveImageOnline(b, name);
      if (url && !isBadImageUrl(url)) return url;
    } catch (_) {
      /* next */
    }
  }

  for (const b of brands) {
    try {
      const ddg = await searchDuckDuckGoImages(b, name);
      if (ddg) return ddg;
    } catch (_) {
      /* next */
    }
    try {
      const bing = await searchBingImages(b, name);
      if (bing) return bing;
    } catch (_) {
      /* next */
    }
  }
  return null;
}

module.exports = {
  resolveImageWithWebFallback,
  searchBrandNames,
  searchDuckDuckGoImages,
  searchBingImages,
};
