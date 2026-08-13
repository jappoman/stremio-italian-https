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
    const manifest = await (await fetch(`${base}/aio/manifest.json`)).json();
    assert.equal(manifest.id, 'community.stremioitalianhttps');
    assert.deepEqual(manifest.resources, ['stream']);
    const normal = await (await fetch(`${base}/normal/manifest.json`)).json();
    assert.equal(normal.id, 'community.stremioitalianhttps.normal');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
