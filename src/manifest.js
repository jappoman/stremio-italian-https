'use strict';

const baseManifest = {
  id: 'community.stremioitalianhttps',
  version: '0.1.0',
  name: 'Italian HTTPS',
  description: 'Direct HTTP/HTTPS streams only. Sources that need a proxy, cookies, custom playback headers, or CAPTCHA are deliberately excluded.',
  types: ['movie', 'series', 'anime'],
  catalogs: [],
  resources: ['stream'],
  behaviorHints: { configurable: false },
};

function manifestFor(format = 'aio') {
  const isAio = format === 'aio';
  return {
    ...baseManifest,
    id: isAio ? `${baseManifest.id}.aio` : baseManifest.id,
    name: isAio ? 'Italian HTTPS (AIO)' : 'Italian HTTPS',
    description: isAio
      ? `${baseManifest.description} AIOStreams fields are enabled.`
      : `${baseManifest.description} Classic Stremio fields only.`,
  };
}

module.exports = { manifest: manifestFor('aio'), manifestFor };
