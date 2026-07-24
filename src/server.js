/**
 * Process entry — HTTP server + Firebase bootstrap + Socket.IO.
 */
'use strict';

const { createApp, startServer } = require('./application');

startServer(createApp()).catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
