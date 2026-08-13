'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseId, stream } = require('../src/handlers');
const { sources } = require('../src/direct');

test('parses Cinemeta movie and episode IDs', () => {
  assert.deepEqual(parseId('tt0133093'), { externalId: 'tt0133093', season: undefined, episode: undefined });
  assert.deepEqual(parseId('tt0944947:1:1'), { externalId: 'tt0944947', season: 1, episode: 1 });
  assert.deepEqual(parseId('tmdb:1399:1:1'), { externalId: 'tmdb1399', season: 1, episode: 1 });
  assert.deepEqual(parseId('kitsu:1:1'), { externalId: 'kitsu:1', season: 1, episode: 1 });
  assert.equal(parseId('invalid'), null);
});

test('returns no stream for unsupported IDs', async () => {
  assert.deepEqual(await stream({ type: 'movie', id: 'invalid' }), { streams: [] });
});

test('only deployable direct sources are enabled', () => {
  assert.deepEqual(sources.map((source) => source.name), ['AnimeWorld']);
});
