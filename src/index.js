'use strict';

const { app } = require('./app');
const port = Number.parseInt(process.env.PORT || '7000', 10);
const RELEASE = 'resolver-trace-2026-08-13';
app.listen(port, () => {
  console.log(`[startup] ${RELEASE} | app=${require.resolve('./app')} | direct=${require.resolve('./direct')}`);
  console.log(`Italian HTTPS addon listening on http://127.0.0.1:${port}/manifest.json`);
});
