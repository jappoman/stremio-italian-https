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

test('classic stream has only classic Stremio fields', () => {
  const stream = buildStream({ source: 'Test', title: 'Titolo', url: 'https://example.test/video.mp4', streamFormat: 'classic' });
  assert.deepEqual(stream, { name: 'Test', title: 'Titolo', url: 'https://example.test/video.mp4' });
});

test('AIO stream exposes the parser fields used by AIOStreams', () => {
  const stream = buildStream({ source: 'Source', title: 'Serie', url: 'https://example.test/video.mp4', season: 1, episode: 2, sizeBytes: 1234 });
  assert.equal(stream.name, 'Source');
  assert.equal(stream.title, 'Serie');
  assert.equal(stream.behaviorHints.filename, 'Serie.S01E02.mp4');
  assert.equal(stream.behaviorHints.videoSize, 1234);
  assert.match(stream.description, /^Serie\.S01E02\.mp4\n/);
});

test('AIO filename does not duplicate an episode already in the title', () => {
  const stream = buildStream({ source: 'Test', title: 'Dragon Ball GT S1E1', url: 'https://example.test/video.mp4', season: 1, episode: 1 });
  assert.equal(stream.behaviorHints.filename, 'Dragon Ball GT S01E01.mp4');
});
