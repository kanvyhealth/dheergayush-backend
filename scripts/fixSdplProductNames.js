/** Fix mis-parsed SDPL product names and image file ids. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RENAMES = {
  DejeEJeoemeJe: 'Aravindasava',
  GMeerjemeJe: 'Ushirasava',
  'MebKe Yemce': 'Shankha Bhasma',
  'Jebie Yemce': 'Vanga Bhasma',
};

function stableId(name) {
  return crypto.createHash('md5').update(`sdpl|${name}`).digest('hex').slice(0, 24);
}

const catalogPath = path.join(__dirname, '..', 'public', 'data', 'medicine-catalog.json');
const imageDir = path.join(__dirname, '..', 'medicine', 'medicine');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const store = catalog.find((s) => /dhootapapeshwar/i.test(s.name || ''));

for (const med of store.medicines) {
  const nextName = RENAMES[med.name];
  if (!nextName) continue;

  const oldFile = med.imageFile;
  const newId = stableId(nextName);
  const newFile = `${newId}.jpg`;
  const oldPath = path.join(imageDir, oldFile);
  const newPath = path.join(imageDir, newFile);

  med.name = nextName;
  med._id = newId;
  med.imageFile = newFile;
  med.description = `${nextName} — authentic Shree Dhootapapeshwar Ayurvedic formulation.`;

  if (oldFile !== newFile && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.copyFileSync(oldPath, newPath);
  }
  console.log('Renamed', Object.keys(RENAMES).find((k) => RENAMES[k] === nextName), '->', nextName);
}

store.medicines.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
console.log('Catalog updated.');
