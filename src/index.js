'use strict';

const { app } = require('./app');
const port = Number.parseInt(process.env.PORT || '7000', 10);
app.listen(port, () => console.log(`Italian HTTPS addon listening on http://127.0.0.1:${port}/manifest.json`));
