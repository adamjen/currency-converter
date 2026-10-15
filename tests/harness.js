// Headless harness for currency-converter/index.html app logic.
// Extracts the inline <script> straight out of index.html (so it can never
// drift), stubs document / localStorage / fetch, and drives the rate-source
// priority, pinning maths, formatting and the cheat-sheet cards.
//   node tests/harness.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

// ── DOM / storage stubs ────────────────────────────────────────────────
const els = {};
const g = id => els[id] || (els[id] = {
  value: '', textContent: '', className: '', innerHTML: '', disabled: false,
  appendChild() {}, addEventListener() {}, scrollIntoView() {}
});
global.document = {
  getElementById: g,
  addEventListener() {},
  createElement: () => ({ className: '', innerHTML: '', appendChild() {} })
};
const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
global.alert = () => {};
global.confirm = () => true;

// ── Fake rate sources ──────────────────────────────────────────────────
const API = {
  result: 'success',
  time_last_update_utc: 'Wed, 14 Oct 2026 00:02:32 +0000',
  rates: { AUD: 1, USD: 0.69793, KHR: 2824.210526 }
};
const FILE = { date: '2026-10-14', base: 'USD', rates: { AUD: 1.4877, USD: 1, KHR: 4056.37 } };

let mode = 'api';        // 'api' | 'file' | 'err' | 'fileerr'
global.fetch = async url => {
  if (url.includes('rates.json')) {
    if (mode === 'file') return { ok: true, status: 200, json: async () => FILE };
    return { ok: false, status: 404 };
  }
  if (mode === 'err') throw new Error('network down');
  return { ok: true, status: 200, json: async () => API };
};

// ── Scenarios (eval'd alongside the app so it can see module scope) ─────
// NOTE: this is a template literal — no backslashes in here.
const test = `
const st = () => document.getElementById('rates-status').textContent;
const cross = () => 'USD->KHR ' + (rates.KHR / rates.USD).toFixed(2) + ' | USD->AUD ' + (rates.AUD / rates.USD).toFixed(4);
const set = (f, t, a) => {
  document.getElementById('from-currency').value = f;
  document.getElementById('to-currency').value = t;
  document.getElementById('from-amount').value = a;
};

(async () => {
  mode = 'api'; await refreshRates();
  console.log('A) live API + pinned USD 0.6722');
  console.log('  ', st(), '|', cross(), '| cached:', store.has('exchange-rate-cache') ? 'yes' : 'NO');

  mode = 'file'; await refreshRates();
  console.log('B) rates.json wins over API');
  console.log('  ', st(), '|', cross());

  mode = 'err'; await refreshRates();
  console.log('C) offline, cache present -> uses cached rates');
  console.log('  ', st(), '|', cross(), '| source:', rateSource);

  localStorage.removeItem('exchange-rate-cache');
  await refreshRates();
  console.log('D) offline, no cache -> baked-in EMBEDDED_RATES');
  console.log('  ', st(), '|', cross(), '| source:', rateSource);

  mode = 'api'; await refreshRates();
  applyOverrides(); applyOverrides();
  console.log('E) idempotency after 2 extra applyOverrides():', rates.USD, rates.KHR.toFixed(4));

  console.log('F) conversions');
  for (const row of [['AUD','USD',10],['USD','KHR',10],['KHR','AUD',20000],['KHR','USD',20000],['KHR','USD',1]]) {
    set(row[0], row[1], row[2]);
    convert();
    console.log('  ', row[2], row[0], '->', document.getElementById('to-amount').textContent, row[1],
      '|', document.getElementById('conversion-detail').textContent);
  }

  console.log('G) cheat sheet');
  updateRefTable();
  console.log('  ', document.getElementById('ref-anchor').textContent);
  const NL = String.fromCharCode(10);
  document.getElementById('ref-cards').innerHTML
    .split('<' + '/tr>').join(NL).split('<' + '/div>').join(NL)
    .replace(/<[^>]+>/g, ' ').replace(/ +/g, ' ')
    .split(NL).map(s => s.trim()).filter(Boolean).forEach(l => console.log('    ', l));

  console.log('H) tap-to-fill');
  quickFill('KHR', 'AUD', 50000);
  console.log('  ', document.getElementById('from-amount').value, 'KHR ->',
    document.getElementById('to-amount').textContent, 'AUD');
})();
`;

eval(src + test);
