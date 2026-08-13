'use strict';

const LANGUAGE_MAP = {
  ita: ['🇮🇹', 'Italian'], it: ['🇮🇹', 'Italian'],
  eng: ['🇬🇧', 'English'], en: ['🇬🇧', 'English'],
  jpn: ['🇯🇵', 'Japanese'], ja: ['🇯🇵', 'Japanese'],
};

function languageFromCode(code) {
  const entry = LANGUAGE_MAP[String(code || '').toLowerCase()];
  return entry ? `${entry[0]} ${entry[1]}` : undefined;
}

function sanitizeTitle(value) {
  return String(value || 'Video').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Video';
}

function filename({ title, year, season, episode, quality, ext }) {
  let out = sanitizeTitle(title);
  out = out.replace(/\bS(\d{1,2})E(\d{1,3})\b/gi, (_match, parsedSeason, parsedEpisode) => (
    `S${String(parsedSeason).padStart(2, '0')}E${String(parsedEpisode).padStart(2, '0')}`
  ));
  if (year) out += ` (${year})`;
  // Resolvers may already include SxxExx in the display title.  Keep a
  // filename parseable by AIOStreams without repeating the same episode.
  if (Number.isInteger(season) && Number.isInteger(episode) && !/\bS\d{1,2}E\d{1,3}\b/i.test(out)) {
    out += `.S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  }
  if (quality) out += `.${quality}`;
  return `${out}.${ext || 'mp4'}`;
}

function formatBytes(bytes) {
  let value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function buildStream({ source, title, url, year, season, episode, quality, language = 'ita', sizeBytes, ext, streamFormat = 'aio' }) {
  const name = filename({ title, year, season, episode, quality, ext: ext || extension(url) });
  if (streamFormat === 'classic') return { name: source, title: title || name, url };
  const languageLabel = languageFromCode(language);
  const description = [name, formatBytes(sizeBytes) && `📦 ${formatBytes(sizeBytes)}`, languageLabel].filter(Boolean).join('\n');
  const behaviorHints = { filename: name, notWebReady: /\.m3u8(?:$|\?)/i.test(url) };
  if (Number.isFinite(Number(sizeBytes)) && Number(sizeBytes) > 0) behaviorHints.videoSize = Number(sizeBytes);
  return { name: source, title: title || name, description, url, behaviorHints };
}

function extension(url) {
  const match = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(String(url || ''));
  return match ? match[1].toLowerCase() : 'mp4';
}

module.exports = { buildStream, filename, formatBytes, languageFromCode };
