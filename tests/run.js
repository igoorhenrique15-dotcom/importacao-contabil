#!/usr/bin/env node
// Suíte sem dependências: node tests/run.js
require('./parsers.test.js')();
require('./engines.test.js')();
require('./store.test.js')();
require('./static.test.js')();
require('./harness').report();
