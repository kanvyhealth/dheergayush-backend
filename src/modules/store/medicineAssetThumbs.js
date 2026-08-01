/**
 * On-demand resized medicine images with disk cache.
 * GET /medicine-thumbs/:width/:file → WebP (or original if sharp unavailable).
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

let sharp = null;
try {
  sharp = require('sharp');
} catch (_) {
  sharp = null;
}

const MIN_W = 80;
const MAX_W = 800;
const DEFAULT_W = 400;

function safeBasename(fileParam) {
  let raw = String(fileParam || '');
  try {
    raw = decodeURIComponent(raw);
  } catch (_) { /* keep raw */ }
  const base = path.basename(raw);
  if (!base || base === '.' || base === '..') return null;
  if (/[\\/]/.test(base)) return null;
  return base;
}

function parseWidth(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_W;
  return Math.min(MAX_W, Math.max(MIN_W, n));
}

function isInsideDir(filePath, dirPath) {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dirPath);
  const rel = path.relative(resolvedDir, resolvedFile);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function sendBuffer(res, buf, contentType) {
  if (res.headersSent) return;
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(contentType);
  res.send(buf);
}

async function sendLocalFile(res, filePath, contentType) {
  const buf = await fsp.readFile(filePath);
  return sendBuffer(res, buf, contentType);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/jpeg';
}

function createMedicineThumbHandler({ sourceDir, cacheDir }) {
  const resolvedSourceDir = path.resolve(sourceDir);
  const resolvedCacheDir = path.resolve(cacheDir);
  fs.mkdirSync(resolvedCacheDir, { recursive: true });

  return async function medicineThumbHandler(req, res) {
    const file = safeBasename(req.params.file);
    const width = parseWidth(req.params.width);
    if (!file) {
      return res.status(400).json({ message: 'Invalid image file' });
    }

    const sourcePath = path.resolve(resolvedSourceDir, file);
    if (!isInsideDir(sourcePath, resolvedSourceDir) || !fs.existsSync(sourcePath)) {
      // Fall back to static asset URL shape so the browser can still try.
      if (!res.headersSent) {
        return res.redirect(302, `/medicine-assets/${encodeURIComponent(file)}`);
      }
      return;
    }

    const assetFallback = () => {
      if (!res.headersSent) {
        return res.redirect(302, `/medicine-assets/${encodeURIComponent(file)}`);
      }
      return null;
    };

    try {
      if (!sharp) {
        await sendLocalFile(res, sourcePath, contentTypeFor(sourcePath));
        return;
      }

      const cacheName = `${width}-${file.replace(/\.[^.]+$/, '')}.webp`;
      const cachePath = path.resolve(resolvedCacheDir, path.basename(cacheName));
      if (!isInsideDir(cachePath, resolvedCacheDir)) {
        return assetFallback();
      }

      if (!fs.existsSync(cachePath)) {
        await fsp.mkdir(resolvedCacheDir, { recursive: true });
        const tmpPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
        try {
          await sharp(sourcePath)
            .rotate()
            .resize({
              width,
              height: width,
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({ quality: 72 })
            .toFile(tmpPath);
          try {
            await fsp.rename(tmpPath, cachePath);
          } catch (_) {
            // Another request may have won the race — use whichever exists.
            if (!fs.existsSync(cachePath) && fs.existsSync(tmpPath)) {
              await fsp.copyFile(tmpPath, cachePath).catch(() => {});
            }
            await fsp.unlink(tmpPath).catch(() => {});
          }
        } catch (err) {
          await fsp.unlink(tmpPath).catch(() => {});
          throw err;
        }
      }

      if (fs.existsSync(cachePath)) {
        await sendLocalFile(res, cachePath, 'image/webp');
        return;
      }

      await sendLocalFile(res, sourcePath, contentTypeFor(sourcePath));
    } catch (err) {
      console.warn('Thumb serve failed for', file, err.message);
      try {
        if (!res.headersSent) {
          await sendLocalFile(res, sourcePath, contentTypeFor(sourcePath));
          return;
        }
      } catch (_) {
        return assetFallback();
      }
    }
  };
}

function toListImageUrl(imageUrl, width = DEFAULT_W) {
  if (!imageUrl) return null;
  const url = String(imageUrl);
  const match = url.match(/^\/medicine-assets\/(.+)$/i);
  if (!match) return url;
  let file = match[1];
  try {
    file = decodeURIComponent(file);
  } catch (_) { /* keep */ }
  const w = parseWidth(width);
  return `/medicine-thumbs/${w}/${encodeURIComponent(file)}`;
}

module.exports = {
  createMedicineThumbHandler,
  toListImageUrl,
  DEFAULT_W
};
