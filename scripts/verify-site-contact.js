const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const canonical = {
  email: 'support@dheergayush.net',
  phoneDisplay: '7842736777',
  phoneTel: '+917842736777',
  phoneFormatted: '+91 7842736777'
};
const oldPublicEmail = /contact@dheergayush\.net/i;
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return fullPath;
  });
}

const sandbox = { window: {} };
vm.runInNewContext(read('public/js/dg-site-contact.js'), sandbox, {
  filename: 'public/js/dg-site-contact.js'
});
const siteContact = sandbox.window.DgSiteContact;

for (const [key, expected] of Object.entries(canonical)) {
  if (!siteContact || siteContact[key] !== expected) {
    failures.push(`DgSiteContact.${key} must be ${expected}`);
  }
}

for (const file of walk(publicDir)) {
  if (!/\.(html|js)$/i.test(file)) continue;
  const relative = path.relative(root, file);
  const contents = fs.readFileSync(file, 'utf8');
  if (oldPublicEmail.test(contents)) {
    failures.push(`${relative} still contains contact@dheergayush.net`);
  }
}

if (failures.length) {
  console.error('Site contact verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Site contact verified: ${canonical.email} / ${canonical.phoneFormatted}`);
