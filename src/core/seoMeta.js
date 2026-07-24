const SITE_NAME = 'DHEERGAYUSH';

function siteOrigin() {
  return String(process.env.SITE_URL || 'https://dheergayush.net').replace(/\/+$/, '');
}

function logoSquareUrl() {
  return `${siteOrigin()}/logos/logo-square.png`;
}

function defaultDescription() {
  return 'DHEERGAYUSH connects you with certified Ayurvedic doctors through secure video consultations, authentic medicines, and home delivery across India.';
}

function readTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : `${SITE_NAME} - Ayurvedic Telemedicine`;
}

function readDescription(html) {
  const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  return m ? m[1].trim() : defaultDescription();
}

function pageUrl(path) {
  const origin = siteOrigin();
  if (!path || path === '/') return origin;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function organizationJsonLd() {
  const origin = siteOrigin();
  const logo = logoSquareUrl();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        alternateName: ['Dheergayush', 'DHEERGAYUSH'],
        url: origin,
        image: logo,
        logo: {
          '@type': 'ImageObject',
          '@id': `${origin}/#logo`,
          url: logo,
          contentUrl: logo,
          width: 512,
          height: 512,
          caption: `${SITE_NAME} logo`
        },
        description: defaultDescription()
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: SITE_NAME,
        publisher: { '@id': `${origin}/#organization` }
      }
    ]
  };
}

function buildSeoTags(html, path) {
  const title = readTitle(html);
  const description = readDescription(html);
  const url = pageUrl(path);
  const image = logoSquareUrl();
  const tags = [];

  if (!/favicon\.ico/i.test(html)) {
    tags.push('<link rel="icon" href="/favicon.ico" sizes="48x48 96x96 192x192">');
  }
  if (!/favicon-48\.png/i.test(html)) {
    tags.push('<link rel="icon" type="image/png" href="/favicon-48.png" sizes="48x48">');
  }
  if (!/favicon-96\.png/i.test(html)) {
    tags.push('<link rel="icon" type="image/png" href="/favicon-96.png" sizes="96x96">');
  }
  if (!/\/favicon\.png/i.test(html)) {
    tags.push('<link rel="icon" type="image/png" href="/favicon.png" sizes="192x192">');
  }
  if (!/apple-touch-icon/i.test(html)) {
    tags.push('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">');
  }
  if (!/site\.webmanifest/i.test(html)) {
    tags.push('<link rel="manifest" href="/site.webmanifest">');
  }
  if (!/theme-color/i.test(html)) {
    tags.push('<meta name="theme-color" content="#F26727">');
  }
  if (!/rel=["']canonical["']/i.test(html)) {
    tags.push(`<link rel="canonical" href="${url}">`);
  }
  if (!/og:image/i.test(html)) {
    tags.push(`<meta property="og:image" content="${image}">`);
    tags.push(`<meta property="og:image:secure_url" content="${image}">`);
    tags.push('<meta property="og:image:type" content="image/png">');
    tags.push('<meta property="og:image:width" content="512">');
    tags.push('<meta property="og:image:height" content="512">');
    tags.push(`<meta property="og:image:alt" content="${SITE_NAME} logo">`);
  }
  if (!/og:site_name/i.test(html)) {
    tags.push(`<meta property="og:site_name" content="${SITE_NAME}">`);
  }
  if (!/og:title/i.test(html)) {
    tags.push(`<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">`);
  }
  if (!/og:description/i.test(html)) {
    tags.push(`<meta property="og:description" content="${description.replace(/"/g, '&quot;')}">`);
  }
  if (!/og:url/i.test(html)) {
    tags.push(`<meta property="og:url" content="${url}">`);
  }
  if (!/og:type/i.test(html)) {
    tags.push('<meta property="og:type" content="website">');
  }
  if (!/twitter:card/i.test(html)) {
    tags.push('<meta name="twitter:card" content="summary">');
    tags.push(`<meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}">`);
    tags.push(`<meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}">`);
    tags.push(`<meta name="twitter:image" content="${image}">`);
  }
  if (!/application\/ld\+json/i.test(html)) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(organizationJsonLd())}</script>`);
  }

  return tags;
}

function injectPageSeo(html, options = {}) {
  if (!html || typeof html !== 'string') return html;
  const tags = buildSeoTags(html, options.path || '/');
  if (!tags.length) return html;
  return html.replace(/<\/head>/i, `${tags.join('\n    ')}\n</head>`);
}

module.exports = { siteOrigin, logoSquareUrl, injectPageSeo, organizationJsonLd };