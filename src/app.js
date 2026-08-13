'use strict';

const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const { manifestFor } = require('./manifest');
const handlers = require('./handlers');

function routerFor(format) {
  const builder = new addonBuilder(manifestFor(format));
  builder.defineStreamHandler((args) => handlers.stream(args, format));
  return getRouter(builder.getInterface());
}

const aioManifest = manifestFor('aio');
const normalManifest = manifestFor('normal');
const app = express();
app.set('trust proxy', true);
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('html').send(`<!doctype html><title>Italian HTTPS</title><h1>Italian HTTPS</h1><p>Stream-only addon with no configuration.</p><p><a href="${base}/aio/manifest.json">Install AIOStreams format</a> · <a href="${base}/normal/manifest.json">Install classic Stremio format</a></p>`);
});
// /manifest.json remains the stable AIO default for existing installs.
app.get('/manifest.json', (_req, res) => res.json(aioManifest));
app.get('/aio/manifest.json', (_req, res) => res.json(aioManifest));
app.get('/normal/manifest.json', (_req, res) => res.json(normalManifest));
app.use('/aio', routerFor('aio'));
app.use('/normal', routerFor('normal'));
app.use(routerFor('aio'));

module.exports = { app };
