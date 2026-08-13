'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const { manifestFor } = require('./manifest');
const handlers = require('./handlers');

// Locally the module lives in src/ and assets are one level up; the Lambda
// esbuild bundle lives at the archive root and carries public/ beside it.
const bundledPublicDir = path.join(__dirname, 'public');
const publicDir = fs.existsSync(bundledPublicDir)
  ? bundledPublicDir
  : path.join(__dirname, '..', 'public');

function routerFor(format) {
  const builder = new addonBuilder(manifestFor(format));
  builder.defineStreamHandler((args) => handlers.stream(args, format));
  return getRouter(builder.getInterface());
}

const app = express();
app.set('trust proxy', true);
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    // Do not log query strings: configured addon URLs can contain secrets.
    console.info(`[http] ${req.method} ${req.path} -> ${res.statusCode} in ${Date.now() - startedAt}ms`);
  });
  next();
});
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.set('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/public', express.static(publicDir));

function sendManifest(format, req, res) {
  const base = `${req.protocol}://${req.get('host')}`;
  const icon = `${base}/public/icon.png`;
  res.json({ ...manifestFor(format), icon, logo: icon, favicon: icon });
}

app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('html').send(`<!doctype html><title>Italian HTTPS</title><h1>Italian HTTPS</h1><p>Stream-only addon with no configuration.</p><p><a href="${base}/manifest.json">Install classic Stremio format</a> · <a href="${base}/aio/manifest.json">Install AIOStreams format</a></p>`);
});
app.get('/manifest.json', (req, res) => sendManifest('classic', req, res));
app.get('/aio/manifest.json', (req, res) => sendManifest('aio', req, res));
app.use('/aio', routerFor('aio'));
app.use(routerFor('classic'));

module.exports = { app };
