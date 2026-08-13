# Italian HTTPS

Stremio stream-only addon that admits only final HTTP/HTTPS media URLs usable
by a bare client. It deliberately does not include a configuration UI: there
are no user credentials, proxy URLs, cookies, custom headers, or source
toggles to configure. Install either `/aio/manifest.json` (AIOStreams fields:
filename, description, language and size when available) or
`/normal/manifest.json` (classic Stremio `name`, `title`, `url` only).

The architecture and AIOStreams formatting follow `stremio-iptv-vod-1.2.0`:
Express app reusable by local Node and AWS Lambda, `/healthz`, stream-only
manifest, AIO-compatible `description`, `behaviorHints.filename` and optional
`videoSize`.

## Source audit

The StreamViX 1.18.29 sources were not copied blindly. The direct
StreamingCommunity/VixSrc resolver is enabled: its playlist, selected variant
and TS media byte passed the bare-client test. The following sources remain
excluded at this revision:

- TOON: Maxstream/UpRot CAPTCHA warm-up and IP whitelist.
- Vavoo: custom auth and headers; its own direct variant is marked VLC-only.
- AnimeWorld: enabled for Kitsu anime IDs. Its SecurityAW2 cookie lookup is
  handled only while discovering the URL; playback itself is verified direct.
- AnimeSaturn: required request headers.
- GuardaSerie: disabled by default and resolves anti-bot host embeds.
- VidXgo, CinemaCity, Eurostreaming, CB01, ToonItalia, ADN: explicitly proxy
  based, IP-bound, or cookie-dependent.

A future source belongs in `src/direct.js` only if its resolver returns a final
media URL and `isBareDirectUrl()` succeeds using only a Range request. This
gate runs again at request time, so a source whose policy changes is silently
withheld rather than returning a broken stream.

## Local verification

```bash
npm ci
npm test
npm start
curl http://127.0.0.1:7000/healthz
curl http://127.0.0.1:7000/manifest.json
```

The Stremio URL is `http://127.0.0.1:7000/manifest.json`. Remote installation
requires HTTPS; `infra/` contains the AWS Lambda Function URL deployment.
