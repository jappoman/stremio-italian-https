'use strict';

const { buildStream } = require('./format');
const { resolveDirectStreams } = require('./direct');

function parseId(id) {
  const value = String(id || '');
  let kitsu = /^kitsu:(\d+)(?::(\d+)(?::(\d+))?)?$/i.exec(value);
  if (kitsu) return { externalId: `kitsu:${kitsu[1]}`, season: kitsu[3] ? Number(kitsu[2]) : kitsu[2] ? 1 : undefined, episode: kitsu[3] ? Number(kitsu[3]) : kitsu[2] ? Number(kitsu[2]) : undefined };
  let match = /^(tt\d+|tmdb\d+)(?::(\d+):(\d+))?$/i.exec(value);
  if (match) return { externalId: match[1], season: match[2] && Number(match[2]), episode: match[3] && Number(match[3]) };
  match = /^tmdb:(\d+)(?::(\d+):(\d+))?$/i.exec(value);
  if (match) return { externalId: `tmdb${match[1]}`, season: match[2] && Number(match[2]), episode: match[3] && Number(match[3]) };
  return null;
}

async function stream({ type, id }, streamFormat = 'aio') {
  const parsed = parseId(id);
  if (!parsed || !['movie', 'series', 'anime'].includes(type)) {
    console.info(`[stream] ignored type=${type} id=${id}: unsupported ID or type`);
    return { streams: [] };
  }
  if (type === 'movie' && (parsed.season || parsed.episode)) return { streams: [] };
  if (type === 'series' && (!parsed.season || !parsed.episode)) return { streams: [] };
  if (type === 'anime' && (!parsed.externalId.startsWith('kitsu:') || !parsed.episode)) return { streams: [] };
  console.info(`[stream] request type=${type} id=${parsed.externalId} season=${parsed.season || '-'} episode=${parsed.episode || '-'} format=${streamFormat}`);
  const candidates = await resolveDirectStreams({ type, id: parsed.externalId, season: parsed.season, episode: parsed.episode });
  console.info(`[stream] returning ${candidates.length} verified stream(s) for ${parsed.externalId}`);
  return {
    streams: candidates.map((candidate) => buildStream({ ...candidate, season: parsed.season, episode: parsed.episode, streamFormat })),
    cacheMaxAge: 300,
  };
}

module.exports = { stream, parseId };
