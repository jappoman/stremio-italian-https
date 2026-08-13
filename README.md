<p align="center">
  <img src="public/icon.png" width="120" alt="Italian HTTPS">
</p>

# 🇮🇹 Stremio Italian HTTPS

<p align="center">
  <a href="https://ko-fi.com/jappoman">
    <img alt="Support on Ko-fi" src="https://img.shields.io/badge/Support%20me%20on%20Ko--fi-%23FF5E5B?logo=ko-fi&logoColor=white&style=for-the-badge">
  </a>
  <a href="https://github.com/jappoman/stremio-italian-https/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/jappoman/stremio-italian-https?style=for-the-badge">
  </a>
  <a href="LICENSE">
    <img alt="License: MIT" src="https://img.shields.io/github/license/jappoman/stremio-italian-https?style=for-the-badge">
  </a>
</p>

Un addon **Stremio** italiano, **stream-only** e senza configurazione: trova
stream HTTP/HTTPS diretti per film, serie e anime dai cataloghi che hai già
installato (Cinemeta, TMDB e compatibili). Restituisce solo URL che un client
Stremio può riprodurre direttamente, senza proxy, cookie, header speciali,
CAPTCHA o credenziali.

> 🔗 **Istanza pubblica**: [apri l'addon](https://xveq22iokni2creoql6q5k2upa0jkdnq.lambda-url.us-east-1.on.aws/) — installa il
> [manifest Classic](https://xveq22iokni2creoql6q5k2upa0jkdnq.lambda-url.us-east-1.on.aws/manifest.json) oppure il
> [manifest AIOStreams](https://xveq22iokni2creoql6q5k2upa0jkdnq.lambda-url.us-east-1.on.aws/aio/manifest.json).

---

## ✨ Caratteristiche

- 🔌 **Stream-only**: nessun catalogo proprio, quindi non compare nella
  ricerca di Stremio.
- ▶️ Solo media **diretti HTTP/HTTPS**, verificati con una sonda fresca prima
  di essere restituiti al player.
- 🧭 Supporto a richieste movie, series e anime con identificativi IMDb, TMDB
  o Kitsu; per IMDb usa anche un fallback prudente sul titolo Cinemeta.
- 🇮🇹 AnimeWorld per gli anime, solo dopo una corrispondenza esatta del titolo.
  Le fonti che bloccano l'hosting AWS o richiedono un proxy non vengono usate.
- 📦 Variante **AIOStreams** con filename parseabile, lingua e dimensione
  quando disponibili (`behaviorHints.filename` e `videoSize`).
- ☁️ Hosting serverless su AWS Lambda: il video va direttamente dalla fonte
  al tuo dispositivo, non transita mai dall'infrastruttura dell'addon.

## ⚙️ Installazione

### Istanza ospitata

Dopo il primo deploy, apri l'URL pubblico sopra e installa uno dei manifest:

| Formato | Percorso | Quando usarlo |
| --- | --- | --- |
| Classic | `/manifest.json` | Formato Stremio standard (`name`, `title`, `url`). |
| AIOStreams | `/aio/manifest.json` | Metadati aggiuntivi per il parser AIOStreams. |

L'istanza AWS usa HTTPS ed è quindi installabile in tutti i client Stremio.

### Da sorgente

Richiede **Node.js ≥ 18.17**.

```bash
npm ci
npm start
```

Il server locale ascolta su `http://127.0.0.1:7000`:

- Classic: <http://127.0.0.1:7000/manifest.json>
- AIOStreams: <http://127.0.0.1:7000/aio/manifest.json>

L'eccezione localhost è supportata dall'app desktop Stremio; per un host
remoto è necessario HTTPS.

## 🔎 Come funziona

1. Stremio invia una richiesta stream per un titolo di un catalogo compatibile.
2. L'addon risolve l'ID della fonte e, quando appropriato, cerca AnimeWorld.
3. Ogni URL candidato viene controllato come farebbe un player semplice:
   nessun cookie, proxy, header di playback o sessione CAPTCHA.
4. Solo gli stream realmente riproducibili vengono restituiti.

Una pagina trovata non basta: `404`, media non diretto e risposte che
richiedono una sessione vengono scartati silenziosamente. Questa scelta rende
gli URL portabili fra i diversi client Stremio.

## 🧩 AIOStreams

`/aio/manifest.json` offre gli stessi stream con i campi che AIOStreams usa
per ordinare e visualizzare le fonti:

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

Quando la fonte lo consente, `behaviorHints.videoSize` contiene la dimensione
in byte e la descrizione aggiunge una riga `📦`. I filename vengono normalizzati
per evitare indicatori di episodio duplicati.

## ☁️ Deploy AWS Lambda

L'infrastruttura CDK crea solo una Lambda ARM64 Node.js 24, una Function URL
pubblica e log CloudWatch con retention di 7 giorni:

```text
Stremio / browser
        |
        | HTTPS
        v
Lambda Function URL (pubblica)
        |
        v
AWS Lambda -> API delle fonti (solo risoluzione)

Player Stremio -> URL video diretto della fonte
```

Il deploy continuo usa GitHub Actions con GitHub OIDC: **nessuna access key
AWS viene salvata in GitHub**. Il workflow esegue test, synth CDK, deploy e
smoke test di `/healthz` e `/manifest.json` ad ogni push pertinente su `main`
o avvio manuale.

### Setup una tantum

L'account AWS dedicato è `stremio-italian-https` (`470339927029`) in
`us-east-1`, già bootstrapato per CDK. Nel repository GitHub l'Environment
`prod` è configurato con questo secret:

```text
AWS_DEPLOY_ROLE_ARN=arn:aws:iam::470339927029:role/stremio-italian-https-github-deploy
```

Il ruolo accetta token OIDC esclusivamente da
`jappoman/stremio-italian-https` nell'environment GitHub `prod`.

Per un deploy locale, dalla cartella `infra/` con credenziali AWS dell'account
dedicato:

```bash
npm ci
npm run build
npx cdk synth
npx cdk deploy --require-approval never
```

## 🧪 Verifiche locali

```bash
npm test
curl http://127.0.0.1:7000/healthz
curl http://127.0.0.1:7000/manifest.json
curl http://127.0.0.1:7000/aio/manifest.json
```

`npm test` esegue solo la suite di questo progetto; le directory in
`references/` sono materiale di confronto e non vengono incluse.

## 📁 Struttura

```text
public/icon.png     Icona dell'addon, servita da /public/icon.png
src/app.js          Route Express, manifest e router Stremio
src/direct.js       Risoluzione fonti e verifica media diretto
src/handlers.js     Handler stream e parsing degli ID
src/format.js       Formattazione Classic e AIOStreams
src/manifest.js     Varianti del manifest
test/               Suite di test Node
infra/              Deploy AWS CDK
```

## ⚖️ Disclaimer

Usa l'addon soltanto per contenuti e fonti a cui hai diritto di accedere. Sei
responsabile del rispetto delle leggi applicabili e dei termini dei servizi
utilizzati.
