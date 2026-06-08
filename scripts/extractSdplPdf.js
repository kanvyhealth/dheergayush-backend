const fs = require('fs');
const path = require('path');

async function main() {
  const pdfPath = path.join(__dirname, '..', '..', 'shree_dhootapapeshwar.pdf');
  const outPath = path.join(__dirname, 'sdpl-price-list.txt');
  const buf = new Uint8Array(fs.readFileSync(pdfPath));

  let text = '';
  try {
    const pdfParse = require('pdf-parse');
    if (typeof pdfParse === 'function') {
      const data = await pdfParse(buf);
      text = data.text || '';
    } else if (pdfParse.PDFParse) {
      const parser = new pdfParse.PDFParse(buf);
      const data = await parser.getText();
      text = (data && data.text) || String(data || '');
    }
  } catch (err) {
    console.error('pdf-parse failed:', err.message);
  }

  if (!text || text.length < 500) {
    // Fallback: use pdfjs-dist from pdf-parse dependency if available
    try {
      const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
      const loadingTask = pdfjs.getDocument({ data: buf });
      const pdf = await loadingTask.promise;
      const parts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        parts.push(content.items.map((item) => item.str).join(' '));
      }
      text = parts.join('\n\n');
    } catch (err2) {
      console.error('pdfjs fallback failed:', err2.message);
      process.exit(1);
    }
  }

  fs.writeFileSync(outPath, text, 'utf8');
  console.log('Wrote', outPath, 'chars:', text.length);
  console.log(text.slice(0, 1200));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
