const path = require('path');
const ROOT_DIR = path.join(__dirname, '..', '..');
module.exports = {
  ROOT_DIR,
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  UPLOADS_DIR: path.join(ROOT_DIR, 'uploads')
};
