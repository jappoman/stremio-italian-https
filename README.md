# Italian HTTPS

![Italian HTTPS icon](public/icon.png)

Small, configuration-free Stremio addon for Italian direct HTTP/HTTPS
streams. It only returns playback URLs that have passed a fresh bare-client
probe: no proxy, cookies, custom headers, CAPTCHA session, or credentials are
required by the player.

The addon has no catalog of its own. It adds streams to compatible metadata
from Cinemeta and other catalog addons.

## Install

Start the local server:

```powershell
npm ci
npm start
```

Install one manifest in Stremio:

| Format | URL | Use it when |
| --- | --- | --- |
| Classic | `http://127.0.0.1:7000/manifest.json` | You want standard Stremio `name`, `title`, and `url` fields. |
| AIOStreams | `http://127.0.0.1:7000/aio/manifest.json` | You use AIOStreams and want parseable filenames, language and size metadata. |

The local URL works with the Stremio desktop application. A remote deployment
must use HTTPS; see [Deployment](#deployment).

## What it returns

The resolver accepts movie, series and anime requests with IMDb, TMDB or Kitsu
identifiers. It resolves the correct source ID before searching, including a
conservative Cinemeta title fallback for IMDb entries that TMDB does not link
directly (for example localized or dubbed entries).

Streams are attempted in this order:

1. **StreamingCommunity / VixSrc** for direct movie and series playback.
2. **AnimeWorld** as a fallback for animation series, after an exact title
   match. Generic search results are deliberately rejected to avoid returning
   the wrong programme.

A source is silently withheld when it returns no playable direct media. A
successful page lookup alone is not enough.

### Deliberately excluded sources

This project does not include sources that require a playback proxy, cookies,
custom player headers, CAPTCHA warm-up, IP affinity or a VLC-only route. This
keeps the returned URLs portable across Stremio clients.

## AIOStreams format

The `/aio/manifest.json` endpoint returns the same streams plus the fields
used by AIOStreams' parser:

```json
{
  "name": "AnimeWorld",
  "title": "Dragon Ball Z S1E1",
  "description": "Dragon Ball Z S01E01.mp4\n🇮🇹 Italian",
  "url": "https://media.example/video.mp4",
  "behaviorHints": {
    "filename": "Dragon Ball Z S01E01.mp4"
  }
}
```

When known, the media size is supplied as `behaviorHints.videoSize` in bytes
and as a human-readable `📦` line in `description`. Filenames are normalized
to avoid duplicate episode markers.

## Local checks

```powershell
npm test
curl http://127.0.0.1:7000/healthz
curl http://127.0.0.1:7000/manifest.json
curl http://127.0.0.1:7000/aio/manifest.json
```

`npm test` runs only this project's test suite; the reference projects under
`references/` are not included.

## Reading resolver logs

The server logs each meaningful resolution step without exposing playlist
tokens or cookies:

```text
[VixSrc] tt0214341 -> TMDB 12971; consulto ...
[VixSrc] API -> HTTP 404
[AnimeWorld] corrispondenza esatta: "Dragon Ball Z (ITA)" -> ...
[probe][AnimeWorld] ... -> HTTP 206, content-type=video/mp4: OK
```

`HTTP 404` from a source means that source currently has no usable entry for
the requested item. It is not treated as an available stream. If PowerShell
shows garbled non-Latin titles, start it in UTF-8 before running the server:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
```

## Deployment

`src/app.js` exports the Express app so it can run locally or behind AWS
Lambda. The CDK project in `infra/` provides a Lambda Function URL deployment.
Configure the Function URL without an additional CORS layer: the Express app
already sends the CORS headers required by Stremio.

## Repository layout

```text
public/icon.png     Addon icon, served from /public/icon.png
src/app.js          Express routes, manifest and Stremio routers
src/direct.js       Source resolution and bare-direct-media validation
src/handlers.js     Stremio stream handler and ID parsing
src/format.js       Classic and AIOStreams response formatting
src/manifest.js     Manifest variants
test/               Node test suite
infra/              AWS CDK deployment
references/         Read-only comparison projects
```

## Disclaimer

Use this addon only for content and sources you are entitled to access. You
are responsible for complying with applicable law and the terms of the
services involved.
