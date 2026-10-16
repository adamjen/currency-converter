#!/usr/bin/env node
// Refresh the rates baked into index.html from the live API.
//
//   node bake-rates.js             # update EMBEDDED_RATES (live-mode offline fallback)
//   node bake-rates.js --hardcode  # update RATE_OVERRIDES + RATES_AS_OF (the default
//                                  #   hardcoded set). The USD pin in the file is kept:
//                                  #   KHR is re-derived so 1 USD keeps its market cross.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'index.html');
const API = 'https://open.er-api.com/v6/latest/AUD';
const HARDCODE = process.argv.includes('--hardcode');

function rewrite(html, re, line, what) {
  if (!re.test(html)) throw new Error(`${what} line not found in index.html`);
  if (html.match(re)[0] === line) return { html, changed: false };
  return { html: html.replace(re, line), changed: true };
}

(async () => {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  const r = data.rates;
  const date = String(data.time_last_update_utc).split(' ').slice(1, 4).join(' ');

  let html = fs.readFileSync(FILE, 'utf8');
  const lines = [];

  const emb = rewrite(html, /^const EMBEDDED_RATES = .*$/m,
    `const EMBEDDED_RATES = { date: '${date}', rates: { AUD: ${r.AUD}, USD: ${r.USD}, KHR: ${r.KHR} } };`,
    'EMBEDDED_RATES');
  html = emb.html;
  if (emb.changed) lines.push('  EMBEDDED_RATES -> ' + date);

  if (HARDCODE) {
    const ovLine = (html.match(/^const RATE_OVERRIDES = \{[^}]*\};$/m) || [])[0];
    const pin = Number((ovLine && ovLine.match(/USD:\s*([0-9.]+)/) || [])[1]);
    if (!pin) throw new Error('USD pin not found in RATE_OVERRIDES');
    const khr = r.KHR * (pin / r.USD);   // keep the market USD/KHR cross
    const pinned = rewrite(html, /^const RATE_OVERRIDES = \{[^}]*\};$/m,
      `const RATE_OVERRIDES = { AUD: 1, USD: ${pin}, KHR: ${khr.toFixed(4)} };`, 'RATE_OVERRIDES');
    html = pinned.html;
    const asOf = rewrite(html, /^const RATES_AS_OF = .*$/m,
      `const RATES_AS_OF = '${date}';`, 'RATES_AS_OF');
    html = asOf.html;
    if (pinned.changed || asOf.changed) lines.push(`  RATE_OVERRIDES -> USD ${pin}, KHR ${khr.toFixed(4)} (1 USD = ${(khr / pin).toFixed(2)})`);
  }

  if (lines.length === 0) {
    console.log('already up to date (' + date + ')');
    return;
  }
  fs.writeFileSync(FILE, html);
  console.log('baked:\n' + lines.join('\n'));
  console.log('git diff index.html to review; git checkout -- index.html to undo');
})();
