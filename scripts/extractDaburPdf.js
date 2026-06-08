/**
 * OCR Dabur Ayurvedic Specialities price list PDF (scanned tables) into dabur-price-list.txt
 *
 * Usage: node scripts/extractDaburPdf.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
const { createWorker } = require('tesseract.js');

const PDF_PATH = path.join(__dirname, '..', '..', 'Dabur.pdf');
const OUT_PATH = path.join(__dirname, 'dabur-price-list.txt');
const SCALE = Number(process.env.OCR_SCALE || 4);
const START_PAGE = Number(process.env.START_PAGE || 3);
const END_PAGE = Number(process.env.END_PAGE || 0);

async function renderPage(pdf, pageNum, scale) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function ocrImage(pngBuffer, worker) {
  const pre = await sharp(pngBuffer).grayscale().normalize().sharpen().png().toBuffer();
  const { data } = await worker.recognize(pre);
  return data.text || '';
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error('Missing', PDF_PATH);
    process.exit(1);
  }

  const buf = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdf = await pdfjs.getDocument({ data: buf, useSystemFonts: true }).promise;
  const last = END_PAGE > 0 ? Math.min(END_PAGE, pdf.numPages) : pdf.numPages;
  const start = Math.max(1, START_PAGE);

  console.log(`OCR pages ${start}-${last} of ${pdf.numPages} (scale ${SCALE})...`);
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  });

  const parts = [];
  for (let i = start; i <= last; i++) {
    process.stdout.write(`  page ${i}/${last}... `);
    const png = await renderPage(pdf, i, SCALE);
    const text = await ocrImage(png, worker);
    parts.push(`\n--- PAGE ${i} ---\n${text}`);
    console.log(text.length, 'chars');
  }

  await worker.terminate();
  fs.writeFileSync(OUT_PATH, parts.join('\n'), 'utf8');
  console.log('Wrote', OUT_PATH, 'total chars:', parts.join('').length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
