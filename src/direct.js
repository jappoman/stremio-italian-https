'use strict';

/**
 * A source is admitted only after its final playback URL works with this
 * exact probe: no proxy, cookies, Referer/User-Agent, or other headers.
 * Keeping the gate here prevents accidentally reintroducing StreamViX's
 * proxy-only integrations.
 */
async function isBareDirectUrl(url, { timeoutMs = 8000 } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 206) return false;
    const type = response.headers.get('content-type') || '';
    return /video|audio|mpegurl|octet-stream/i.test(type) || /\.(?:m3u8|mp4|mkv|webm|ts)(?:$|[?#])/i.test(response.url);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Registry intentionally starts empty. The StreamViX 1.18.29 providers were
 * audited and excluded because each requires a proxy, headers/cookies, CAPTCHA
 * warm-up, IP affinity, or a VLC-only route. Add a resolver here only after
 * it returns a final URL that passes isBareDirectUrl().
 */
const TMDB_KEY = '40a9faa1f6741afb2c0c40238d85f8d0';

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function tmdbIdFor(externalId, type) {
  if (/^tmdb\d+$/i.test(externalId)) return externalId.replace(/^tmdb/i, '');
  if (!/^tt\d+$/i.test(externalId)) return null;
  const data = await fetchJson(`https://api.themoviedb.org/3/find/${externalId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
  const entries = type === 'movie' ? data.movie_results : data.tv_results;
  return entries && entries[0] ? String(entries[0].id) : null;
}

/** Direct StreamViX StreamingCommunity/VixSrc route, without its proxy modes. */
const vixsrc = {
  name: 'StreamingCommunity',
  async resolve(request) {
    try {
      const tmdbId = await tmdbIdFor(request.id, request.type);
      if (!tmdbId) return [];
      const contentPath = request.type === 'movie'
        ? `/movie/${tmdbId}/`
        : `/tv/${tmdbId}/${request.season}/${request.episode}/`;
      const pageUrl = `https://vixsrc.to${contentPath}`;
      const apiUrl = `https://vixsrc.to${contentPath.replace(/^\/(movie|tv)\//, '/api/$1/')}`;
      const api = await fetchJson(apiUrl);
      if (!api || !api.src) return [];
      const embedUrl = new URL(api.src, 'https://vixsrc.to').toString();
      const embed = await fetch(embedUrl, { headers: { Referer: pageUrl }, signal: AbortSignal.timeout(10000) });
      if (!embed.ok) return [];
      const html = await embed.text();
      const token = /'token':\s*'([\w-]+)'/.exec(html)?.[1];
      const expires = /'expires':\s*'(\d+)'/.exec(html)?.[1];
      const rawUrl = /url:\s*'([^']+)'/.exec(html)?.[1];
      if (!token || !expires || !rawUrl) return [];
      const playlist = new URL(rawUrl, 'https://vixsrc.to');
      if (!/\.m3u8$/i.test(playlist.pathname)) playlist.pathname += '.m3u8';
      playlist.searchParams.set('token', token);
      playlist.searchParams.set('expires', expires);
      if (/canPlayFHD\s*=\s*true/.test(html)) playlist.searchParams.set('h', '1');
      return [{
        source: this.name,
        title: request.type === 'movie' ? 'StreamingCommunity' : `StreamingCommunity S${request.season}E${request.episode}`,
        url: playlist.toString(),
        language: 'ita',
      }];
    } catch (error) {
      console.warn('[direct][vixsrc] skipped:', error.message);
      return [];
    }
  },
};

const AW_BASE = 'https://www.animeworld.ac';
const AW_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
let animeWorldCookie;

function awUrl(path) {
  const url = new URL(path, AW_BASE);
  if (animeWorldCookie) url.searchParams.set('d', '1');
  return url;
}

async function awFetch(path, init = {}) {
  const headers = { 'user-agent': AW_UA, 'accept-language': 'it-IT,it;q=0.9,en;q=0.8', ...(init.headers || {}) };
  if (animeWorldCookie) headers.cookie = animeWorldCookie;
  let response = await fetch(awUrl(path), { ...init, headers, signal: AbortSignal.timeout(12000) });
  let body = await response.text();
  const match = /SecurityAW2-os=([a-f0-9]+)/i.exec(body);
  if (match && !animeWorldCookie) {
    animeWorldCookie = `SecurityAW2-os=${match[1]}`;
    headers.cookie = animeWorldCookie;
    response = await fetch(awUrl(path), { ...init, headers, signal: AbortSignal.timeout(12000) });
    body = await response.text();
  }
  if (!response.ok) throw new Error(`AnimeWorld HTTP ${response.status}`);
  return { body, headers };
}

function animeWorldMediaUrl(html) {
  const text = String(html || '').replace(/\\\//g, '/');
  return /https?:\/\/[^\s"'<>\\]+(?:\.mp4|\.m3u8)(?:[^\s"'<>\\]*)?/i.exec(text)?.[0] || null;
}

const animeWorld = {
  name: 'AnimeWorld',
  async resolve(request) {
    if (request.type !== 'anime' || !/^kitsu:\d+$/i.test(request.id) || !request.episode) return [];
    try {
      const kitsuId = request.id.slice('kitsu:'.length);
      const kitsu = await fetchJson(`https://kitsu.io/api/edge/anime/${kitsuId}`);
      const title = kitsu?.data?.attributes?.titles?.en || kitsu?.data?.attributes?.titles?.en_jp || kitsu?.data?.attributes?.canonicalTitle;
      if (!title) return [];
      const search = await awFetch(`/filter?keyword=${encodeURIComponent(title)}`);
      const matches = [...search.body.matchAll(/href=["'](?:https?:\/\/[^"']+)?\/play\/([^/?#"']+)/gi)].map((match) => match[1]);
      const slug = matches[0];
      if (!slug) return [];
      const play = await awFetch(`/play/${slug}`);
      const anchors = [...play.body.matchAll(/<a\b[^>]*data-episode-num=["']?(\d+)[^>]*href=["']([^"']+)/gi)];
      const anchor = anchors.find((match) => Number(match[1]) === Number(request.episode));
      const token = anchor && /\/play\/[^/]+\/([^/?#]+)/.exec(anchor[2])?.[1];
      if (!token) return [];
      const player = await awFetch(`/api/episode/serverPlayerAnimeWorld?id=${encodeURIComponent(token)}`, {
        headers: { 'x-requested-with': 'XMLHttpRequest', referer: `${AW_BASE}/play/${slug}/${token}` },
      });
      const url = animeWorldMediaUrl(player.body);
      return url ? [{ source: this.name, title: `${title} S${request.season || 1}E${request.episode}`, url, language: /_ITA\.mp4/i.test(url) ? 'ita' : 'jpn' }] : [];
    } catch (error) {
      console.warn('[direct][animeworld] skipped:', error.message);
      return [];
    }
  },
};

// Only sources that have passed a bare manifest + media-byte test belong here.
const sources = [vixsrc, animeWorld];

async function resolveDirectStreams(request) {
  const settled = await Promise.allSettled(sources.map((source) => source.resolve(request)));
  const candidates = settled.flatMap((result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
  const verified = await Promise.all(candidates.map(async (candidate) => ({ candidate, ok: await isBareDirectUrl(candidate.url) })));
  return verified.filter(({ ok }) => ok).map(({ candidate }) => candidate);
}

module.exports = { isBareDirectUrl, resolveDirectStreams, sources };
