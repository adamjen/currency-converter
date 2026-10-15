#!/usr/bin/env node
// Re-bake the offline fallback rates (EMBEDDED_RATES in index.html) from the live API.
// Run this before copying index.html onto a phone for offline use.
//   node bake-rates.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'index.html');
const API = 'https://open.er-api.com/v6/latest/AUD';

(async () => {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  const r = data.rates;
  const date = String(data.time_last_update_utc).split(' ').slice(1, 4).join(' ');

  const line = `const EMBEDDED_RATES = { date: '${date}', rates: { AUD: ${r.AUD}, USD: ${r.USD}, KHR: ${r.KHR} } };`;
  const html = fs.readFileSync(FILE, 'utf8');
  const re = /^const EMBEDDED_RATES = .*$/m;

  if (!re.test(html)) throw new Error('EMBEDDED_RATES line not found in index.html');
  if (html.match(re)[0] === line) {
    console.log('already up to date:\n ', line);
    return;
  }
  fs.writeFileSync(FILE, html.replace(re, line));
  console.log('baked:\n ', line);
  console.log('git diff index.html to review; git checkout -- index.html to undo');
})();
