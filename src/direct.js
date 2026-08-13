'use strict';

/**
 * A source is admitted only after its final playback URL works with this
 * exact probe: no proxy, cookies, Referer/User-Agent, or other headers.
 * Keeping the gate here prevents accidentally reintroducing StreamViX's
 * proxy-only integrations.
 */
function safeUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '<invalid URL>';
  }
}

function mediaSizeFromResponse(response) {
  const range = response.headers.get('content-range');
  const total = /\/(\d+)$/.exec(range || '')?.[1];
  if (total && Number(total) > 0) return Number(total);
  // A server that ignores Range may send its whole body with HTTP 200.
  const length = response.headers.get('content-length');
  return response.status === 200 && length && Number(length) > 0 ? Number(length) : undefined;
}

async function probeBareDirectUrl(url, { timeoutMs = 8000, source = 'source' } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch {
    console.info(`[probe][${source}] URL non valido`);
    return { ok: false };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    console.info(`[probe][${source}] protocollo non supportato: ${parsed.protocol}`);
    return { ok: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 206) {
      console.info(`[probe][${source}] ${safeUrlLabel(url)} -> HTTP ${response.status}: SCARTATO`);
      return { ok: false };
    }
    const type = response.headers.get('content-type') || '';
    const accepted = /video|audio|mpegurl|octet-stream/i.test(type) || /\.(?:m3u8|mp4|mkv|webm|ts)(?:$|[?#])/i.test(response.url);
    console.info(`[probe][${source}] ${safeUrlLabel(url)} -> HTTP ${response.status}, content-type=${type || '-'}: ${accepted ? 'OK' : 'SCARTATO'}`);
    return { ok: accepted, sizeBytes: accepted ? mediaSizeFromResponse(response) : undefined };
  } catch (error) {
    console.info(`[probe][${source}] ${safeUrlLabel(url)} -> errore ${error.name || 'di rete'}: SCARTATO`);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function isBareDirectUrl(url, options) {
  return (await probeBareDirectUrl(url, options)).ok;
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

function comparableTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function comparableAnimeWorldTitle(value) {
  return comparableTitle(String(value || '').replace(/\s*\((?:sub\s*)?ita\)\s*$/i, ''));
}

async function cinemetaMetaFor(externalId, type) {
  if (!/^tt\d+$/i.test(externalId)) return null;
  const data = await fetchJson(`https://v3-cinemeta.strem.io/meta/${type}/${externalId}.json`);
  return data?.meta || null;
}

async function tmdbIdFor(externalId, type) {
  if (/^tmdb\d+$/i.test(externalId)) return externalId.replace(/^tmdb/i, '');
  if (!/^tt\d+$/i.test(externalId)) return null;
  const data = await fetchJson(`https://api.themoviedb.org/3/find/${externalId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
  const entries = type === 'movie' ? data.movie_results : data.tv_results;
  if (entries && entries[0]) return String(entries[0].id);

  // Some localized/dub IMDb entries are not linked by TMDB.  Cinemeta still
  // knows their canonical display title, which lets us make a conservative,
  // exact-title TMDB lookup without guessing between similarly named shows.
  const meta = await cinemetaMetaFor(externalId, type);
  const title = String(meta?.name || '').trim();
  if (!title) return null;
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const search = await fetchJson(`https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_KEY}&language=it-IT&query=${encodeURIComponent(title)}`);
  const match = (search.results || []).find((result) => comparableTitle(result.title || result.name) === comparableTitle(title)
    || comparableTitle(result.original_title || result.original_name) === comparableTitle(title));
  if (match) {
    console.info(`[TMDB] ${externalId} non collegato da /find; Cinemeta=${JSON.stringify(title)} -> corrispondenza esatta TMDB ${match.id}`);
    return String(match.id);
  }
  console.info(`[TMDB] ${externalId} non collegato da /find; Cinemeta=${JSON.stringify(title)} -> nessuna corrispondenza TMDB esatta`);
  return null;
}

function uniqueTitles(values) {
  const seen = new Set();
  return values.filter((value) => {
    const title = String(value || '').trim();
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// IDs from Cinemeta are language-independent.  Text-search sources, however,
// need titles in the language used by their catalogue, so retain localized,
// original and alternative titles instead of relying on a single display name.
async function tmdbSeriesSearchData(externalId) {
  const tmdbId = await tmdbIdFor(externalId, 'series');
  if (!tmdbId) return null;
  const data = await fetchJson(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}&language=it-IT&append_to_response=alternative_titles`);
  const titles = uniqueTitles([
    data.name,
    data.original_name,
    ...(data.alternative_titles?.results || []).map((item) => item.title),
  ]);
  const isAnimation = (data.genres || []).some((genre) => genre.id === 16);
  console.info(`[TMDB] ${externalId} -> serie ${tmdbId}; animazione=${isAnimation ? 'sì' : 'no'}; titoli=${titles.map((title) => JSON.stringify(title)).join(', ') || '-'}`);
  return {
    isAnimation,
    titles,
  };
}

async function tmdbMovieSearchData(externalId) {
  const tmdbId = await tmdbIdFor(externalId, 'movie');
  if (!tmdbId) return null;
  const data = await fetchJson(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&language=it-IT&append_to_response=alternative_titles`);
  const titles = uniqueTitles([
    data.title,
    data.original_title,
    ...(data.alternative_titles?.titles || []).map((item) => item.title),
  ]);
  const isAnimation = (data.genres || []).some((genre) => genre.id === 16);
  console.info(`[TMDB] ${externalId} -> film ${tmdbId}; animazione=${isAnimation ? 'sì' : 'no'}; titoli=${titles.map((title) => JSON.stringify(title)).join(', ') || '-'}`);
  return { isAnimation, titles };
}

/**
 * Direct StreamViX StreamingCommunity/VixSrc route, without its proxy modes.
 *
 * Kept here as a documented resolver, but intentionally not enabled below:
 * VixSrc blocks this Lambda's AWS datacenter egress with HTTP 403 on every
 * tested movie and series endpoint. It may work from a residential IP, but a
 * server-side addon cannot rely on it without introducing a proxy workaround.
 */
const vixsrc = {
  name: 'StreamingCommunity',
  async resolve(request) {
    try {
      const tmdbId = await tmdbIdFor(request.id, request.type);
      if (!tmdbId) {
        console.info(`[VixSrc] Nessun ID TMDB trovato per ${request.id}`);
        return [];
      }
      const contentPath = request.type === 'movie'
        ? `/movie/${tmdbId}/`
        : `/tv/${tmdbId}/${request.season}/${request.episode}/`;
      const pageUrl = `https://vixsrc.to${contentPath}`;
      const apiUrl = `https://vixsrc.to${contentPath.replace(/^\/(movie|tv)\//, '/api/$1/')}`;
      console.info(`[VixSrc] ${request.id} -> TMDB ${tmdbId}; consulto ${safeUrlLabel(apiUrl)}`);
      const apiResponse = await fetch(apiUrl, { headers: { Accept: 'application/json, text/plain, */*', Referer: 'https://vixsrc.to/' }, signal: AbortSignal.timeout(10000) });
      console.info(`[VixSrc] API -> HTTP ${apiResponse.status}`);
      if (!apiResponse.ok) return [];
      const api = await apiResponse.json();
      if (!api || !api.src) {
        console.info('[VixSrc] API valida ma senza campo src');
        return [];
      }
      const embedUrl = new URL(api.src, 'https://vixsrc.to').toString();
      const embed = await fetch(embedUrl, { headers: { Referer: pageUrl }, signal: AbortSignal.timeout(10000) });
      console.info(`[VixSrc] embed ${safeUrlLabel(embedUrl)} -> HTTP ${embed.status}`);
      if (!embed.ok) return [];
      const html = await embed.text();
      const token = /'token':\s*'([\w-]+)'/.exec(html)?.[1];
      const expires = /'expires':\s*'(\d+)'/.exec(html)?.[1];
      const rawUrl = /url:\s*'([^']+)'/.exec(html)?.[1];
      if (!token || !expires || !rawUrl) {
        console.info(`[VixSrc] embed analizzato: token=${Boolean(token)}, scadenza=${Boolean(expires)}, playlist=${Boolean(rawUrl)}; nessuno stream`);
        return [];
      }
      const playlist = new URL(rawUrl, 'https://vixsrc.to');
      if (!/\.m3u8$/i.test(playlist.pathname)) playlist.pathname += '.m3u8';
      playlist.searchParams.set('token', token);
      playlist.searchParams.set('expires', expires);
      if (/canPlayFHD\s*=\s*true/.test(html)) playlist.searchParams.set('h', '1');
      let displayTitle;
      try {
        displayTitle = (await cinemetaMetaFor(request.id, request.type))?.name;
      } catch (error) {
        console.info(`[VixSrc] titolo Cinemeta non disponibile: ${error.message}`);
      }
      return [{
        source: this.name,
        title: displayTitle || (request.type === 'movie' ? 'StreamingCommunity' : `StreamingCommunity S${request.season}E${request.episode}`),
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
  return { body, headers, status: response.status };
}

function animeWorldMediaUrl(html) {
  const text = String(html || '').replace(/\\\//g, '/');
  return /https?:\/\/[^\s"'<>\\]+(?:\.mp4|\.m3u8)(?:[^\s"'<>\\]*)?/i.exec(text)?.[0] || null;
}

const animeWorld = {
  name: 'AnimeWorld',
  async resolve(request) {
    if (!request.episode) return [];
    try {
      let titles;
      if (request.type === 'anime' && /^kitsu:\d+$/i.test(request.id)) {
        const kitsuId = request.id.slice('kitsu:'.length);
        const kitsu = await fetchJson(`https://kitsu.io/api/edge/anime/${kitsuId}`);
        titles = uniqueTitles([
          kitsu?.data?.attributes?.titles?.en,
          kitsu?.data?.attributes?.titles?.en_jp,
          kitsu?.data?.attributes?.canonicalTitle,
        ]);
      } else if (request.type === 'series') {
        const metadata = await tmdbSeriesSearchData(request.id);
        if (!metadata?.isAnimation) {
          console.info(`[AnimeWorld] ${request.id} non è classificato come animazione da TMDB: fallback non eseguito`);
          return [];
        }
        titles = metadata.titles;
      } else {
        return [];
      }
      let title;
      let slug;
      for (const candidateTitle of titles) {
        const search = await awFetch(`/filter?keyword=${encodeURIComponent(candidateTitle)}`);
        const matches = [...search.body.matchAll(/<a\b[^>]*href=["'](?:https?:\/\/[^"']+)?\/play\/([^/?#"']+)[^>]*data-jtitle=["']([^"']+)/gi)]
          .map((match) => ({ slug: match[1], title: match[2] }));
        const distinctMatches = [...new Map(matches.map((match) => [match.slug, match])).values()];
        const exact = distinctMatches.find((match) => comparableAnimeWorldTitle(match.title) === comparableTitle(candidateTitle));
        console.info(`[AnimeWorld] ricerca ${JSON.stringify(candidateTitle)} -> HTTP ${search.status}, ${distinctMatches.length} risultati${distinctMatches.length ? `: ${distinctMatches.slice(0, 3).map((match) => JSON.stringify(match.title)).join(', ')}` : ''}`);
        if (exact) {
          title = candidateTitle;
          slug = exact.slug;
          console.info(`[AnimeWorld] corrispondenza esatta: ${JSON.stringify(exact.title)} -> ${slug}`);
          break;
        }
      }
      if (!slug) {
        console.info('[AnimeWorld] nessun titolo ha prodotto una corrispondenza');
        return [];
      }
      const play = await awFetch(`/play/${slug}`);
      const anchors = [...play.body.matchAll(/<a\b[^>]*data-episode-num=["']?(\d+)[^>]*href=["']([^"']+)/gi)];
      const anchor = anchors.find((match) => Number(match[1]) === Number(request.episode));
      const token = anchor && /\/play\/[^/]+\/([^/?#]+)/.exec(anchor[2])?.[1];
      console.info(`[AnimeWorld] pagina ${slug} -> HTTP ${play.status}, episodi trovati=${anchors.length}, episodio richiesto=${request.episode}: ${token ? 'trovato' : 'non trovato'}`);
      if (!token) return [];
      const player = await awFetch(`/api/episode/serverPlayerAnimeWorld?id=${encodeURIComponent(token)}`, {
        headers: { 'x-requested-with': 'XMLHttpRequest', referer: `${AW_BASE}/play/${slug}/${token}` },
      });
      const url = animeWorldMediaUrl(player.body);
      console.info(`[AnimeWorld] player episodio ${request.episode} -> HTTP ${player.status}, media=${url ? safeUrlLabel(url) : 'non trovato'}`);
      return url ? [{ source: this.name, title: `${title} S${request.season || 1}E${request.episode}`, url, language: /_ITA\.mp4/i.test(url) ? 'ita' : 'jpn' }] : [];
    } catch (error) {
      console.warn('[direct][animeworld] skipped:', error.message);
      return [];
    }
  },
};

const AS_BASE = 'https://www.animesaturn.net';
const AS_UA = AW_UA;
let animeSaturnCookie;

function asSetCookie(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')];
  const pairs = values.filter(Boolean).map((value) => String(value).split(';')[0]).filter(Boolean);
  if (pairs.length) animeSaturnCookie = pairs.join('; ');
}

async function asFetch(path, init = {}) {
  const headers = { 'user-agent': AS_UA, 'accept-language': 'it-IT,it;q=0.9,en;q=0.8', ...(init.headers || {}) };
  if (animeSaturnCookie) headers.cookie = animeSaturnCookie;
  const response = await fetch(new URL(path, AS_BASE), { ...init, headers, signal: AbortSignal.timeout(12000) });
  asSetCookie(response);
  if (!response.ok) throw new Error(`AnimeSaturn HTTP ${response.status}`);
  return { body: await response.text(), status: response.status };
}

function animeSaturnMatches(html) {
  const matches = [...String(html).matchAll(/<a\b[^>]*href=["']\/anime\/([^/?#"']+)[^>]*>[\s\S]{0,900}?<h3[^>]*>\s*([^<]+?)\s*<\/h3>/gi)]
    .map((match) => ({ slug: match[1], title: match[2].trim() }));
  return [...new Map(matches.map((match) => [match.slug, match])).values()];
}

function animeSaturnEmbedUrl(html) {
  const text = String(html).replace(/&amp;/g, '&').replace(/\\\//g, '/');
  return /https:\/\/play\.saturncdn\.net\/embed\/\d+\?token=[^\s"'<>&]+&expires=\d+/i.exec(text)?.[0] || null;
}

function decodeAnimeSaturnUrl(encoded, key) {
  const bytes = Buffer.from(String(encoded), 'base64');
  let value = '';
  for (let index = 0; index < bytes.length; index += 1) value += String.fromCharCode(bytes[index] ^ key.charCodeAt(index % key.length));
  return value;
}

async function animeSaturnMediaUrl(embedUrl) {
  const embed = await asFetch(embedUrl, { headers: { referer: `${AS_BASE}/` } });
  const id = /\bi\s*:\s*(\d+)/.exec(embed.body)?.[1];
  const key = /\bk\s*:\s*["']([^"']+)/.exec(embed.body)?.[1];
  const expires = /\be\s*:\s*(\d+)/.exec(embed.body)?.[1];
  if (!id || !key || !expires) return null;
  const playlist = await asFetch(`/embed/${id}/playlist?token=${encodeURIComponent(key)}&expires=${expires}`, {
    headers: { referer: embedUrl, accept: 'application/json' },
  });
  let payload;
  try { payload = JSON.parse(playlist.body); } catch { return null; }
  const url = payload?.d ? decodeAnimeSaturnUrl(payload.d, key) : null;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch { return null; }
}

const animeSaturn = {
  name: 'AnimeSaturn',
  async resolve(request) {
    try {
      let titles;
      let requestedEpisode = request.episode || 1;
      if (request.type === 'anime' && /^kitsu:\d+$/i.test(request.id)) {
        const kitsu = await fetchJson(`https://kitsu.io/api/edge/anime/${request.id.slice('kitsu:'.length)}`);
        titles = uniqueTitles([kitsu?.data?.attributes?.titles?.en, kitsu?.data?.attributes?.titles?.en_jp, kitsu?.data?.attributes?.canonicalTitle]);
      } else if (request.type === 'series') {
        const metadata = await tmdbSeriesSearchData(request.id);
        if (!metadata?.isAnimation) return [];
        titles = metadata.titles;
      } else if (request.type === 'movie') {
        const metadata = await tmdbMovieSearchData(request.id);
        if (!metadata?.isAnimation) return [];
        titles = metadata.titles;
      } else return [];

      let selected;
      let title;
      for (const candidateTitle of titles) {
        const search = await asFetch(`/filter?key=${encodeURIComponent(candidateTitle)}`);
        const matches = animeSaturnMatches(search.body);
        const exact = matches.find((match) => comparableAnimeWorldTitle(match.title) === comparableTitle(candidateTitle));
        console.info(`[AnimeSaturn] ricerca ${JSON.stringify(candidateTitle)} -> HTTP ${search.status}, ${matches.length} risultati`);
        if (exact) { selected = exact; title = exact.title; break; }
      }
      if (!selected) return [];
      const watch = await asFetch(`/anime/${selected.slug}/ep-${requestedEpisode}`);
      const embedUrl = animeSaturnEmbedUrl(watch.body);
      if (!embedUrl) {
        console.info(`[AnimeSaturn] ${selected.slug} episodio ${requestedEpisode}: embed non trovato`);
        return [];
      }
      const url = await animeSaturnMediaUrl(embedUrl);
      console.info(`[AnimeSaturn] ${selected.slug} episodio ${requestedEpisode}: media=${url ? safeUrlLabel(url) : 'non trovato'}`);
      return url ? [{ source: this.name, title: `${title} S${request.season || 1}E${requestedEpisode}`, url, language: /(?:ITA|ITALIAN)/i.test(url) ? 'ita' : 'jpn' }] : [];
    } catch (error) {
      console.warn('[direct][animesaturn] skipped:', error.message);
      return [];
    }
  },
};

// VixSrc is deliberately excluded: AWS Lambda receives HTTP 403 consistently.
// Only sources that work from this deployment and pass a bare media-byte test
// belong here.
const sources = [animeWorld, animeSaturn];

async function resolveDirectStreams(request) {
  const outcomes = [];
  const directStreams = [];
  for (const source of sources) {
    let candidates = [];
    try {
      const result = await source.resolve(request);
      candidates = Array.isArray(result) ? result : [];
    } catch (error) {
      console.warn(`[direct][${source.name}] skipped:`, error.message);
      outcomes.push(`${source.name}:error`);
      continue;
    }
    outcomes.push(`${source.name}:${candidates.length}`);
    console.info(`[direct] ${source.name}: ${candidates.length} candidato/i da verificare`);
    const verified = await Promise.all(candidates.map(async (candidate) => ({ candidate, ...(await probeBareDirectUrl(candidate.url, { source: candidate.source })) })));
    for (const { candidate, ok } of verified) {
      if (!ok) console.info(`[direct] rejected non-bare URL from ${candidate.source}`);
    }
    const direct = verified.filter(({ ok }) => ok).map(({ candidate, sizeBytes }) => ({ ...candidate, sizeBytes: sizeBytes || candidate.sizeBytes }));
    directStreams.push(...direct);
  }
  console.info(`[direct] resolver results for ${request.type}/${request.id}: ${outcomes.join(', ')}`);
  return directStreams;
}

module.exports = { isBareDirectUrl, resolveDirectStreams, sources };
