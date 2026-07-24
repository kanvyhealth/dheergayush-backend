/**
 * Express application factory (thin re-export).
 * Middleware + domain mounts live in application.js createApp().
 */
'use strict';

const { createApp } = require('./application');

module.exports = { createApp };
