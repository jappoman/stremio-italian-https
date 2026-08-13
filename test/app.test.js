'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/app');

test('health and manifest work end-to-end over HTTP', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const manifestResponse = await fetch(`${base}/manifest.json`);
    assert.equal(manifestResponse.headers.get('access-control-allow-origin'), '*');
    assert.equal(manifestResponse.headers.get('access-control-allow-private-network'), 'true');
    const manifest = await manifestResponse.json();
    assert.equal(manifest.id, 'community.stremioitalianhttps');
    assert.deepEqual(manifest.resources, ['stream']);
    assert.equal(manifest.icon, `${base}/public/icon.png`);
    const icon = await fetch(manifest.icon);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');
    assert.ok((await icon.arrayBuffer()).byteLength > 0);
    const aio = await (await fetch(`${base}/aio/manifest.json`)).json();
    assert.equal(aio.id, 'community.stremioitalianhttps.aio');
    const removedRoute = await fetch(`${base}/normal/manifest.json`);
    assert.equal(removedRoute.status, 404);
    const preflight = await fetch(`${base}/manifest.json`, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
