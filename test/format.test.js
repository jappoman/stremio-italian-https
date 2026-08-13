'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStream } = require('../src/format');

test('AIO stream has parseable filename, language and size', () => {
  const stream = buildStream({ source: 'Test', title: 'Titolo', url: 'https://example.test/video.mp4', year: '2025', quality: '1080p', language: 'ita', sizeBytes: 1024 ** 3 });
  assert.equal(stream.behaviorHints.filename, 'Titolo (2025).1080p.mp4');
  assert.match(stream.description, /📦 1\.00 GB/);
  assert.match(stream.description, /🇮🇹 Italian/);
});

test('normal stream has only classic Stremio fields', () => {
  const stream = buildStream({ source: 'Test', title: 'Titolo', url: 'https://example.test/video.mp4', streamFormat: 'normal' });
  assert.deepEqual(stream, { name: 'Test', title: 'Titolo', url: 'https://example.test/video.mp4' });
});
