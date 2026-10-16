// Headless smoke test: runs index.html's script in a stubbed DOM.
// Usage: node tests/harness.js
//
// Covers both modes: hardcoded (default, zero network) with the ⬇ Latest
// download / ↺ Hardcoded round trip, then the live chain with KHR unpinned
// (API, rates.json, offline cache, baked-in fallback).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) throw new Error('no inline script found in index.html');
const code = scripts.join('\n');

const store = new Map();
const els = new Map();
let fetchCalls = 0;

function makeEl(id) {
  const el = {
    id, value: '', textContent: '', innerHTML: '', className: '', href: '',
    disabled: false,
    classList: { classes: new Set(), toggle(c, on) { on ? this.classes.add(c) : this.classes.delete(c); } },
    style: {},
    addEventListener() {},
    setAttribute() {},
    querySelector() { return makeEl(id + '-child'); },
    scrollIntoView() {},
  };
  els.set(id, el);
  return el;
}

const sandbox = {
  console,
  confirm: () => true,
  alert: () => {},
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: () => {},
  encodeURIComponent: encodeURIComponent,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  document: {
    getElementById: (id) => els.get(id) || makeEl(id),
    createElement: () => makeEl('anon'),
    addEventListener() {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// NETWORK STUB — ratesOk flips the API, fileOk flips rates.json
let ratesOk = true, fileOk = false;
sandbox.fetch = async (url) => {
  fetchCalls++;
  const u = String(url);
  if (u.includes('rates.json')) {
    if (!fileOk) return { ok: false, status: 404, statusText: 'Not Found' };
    return { ok: true, json: async () => ({ base: 'USD', date: '2026-10-13', rates: { AUD: 1.4911, KHR: 4056 } }) };
  }
  if (!ratesOk) throw new TypeError('Failed to fetch');
  return {
    ok: true,
    json: async () => ({
      success: true,
      date: '2026-10-14',
      time_last_update_utc: 'Wed, 14 Oct 2026 00:01:24 +0000',
      base: 'AUD',
      rates: { AUD: 1, USD: 0.69783, KHR: 2837.763158 },
    }),
  };
};

const G = (expr) => vm.runInContext(expr, sandbox);
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const out = [];
const line = (k, v) => out.push(`${k.padEnd(24)} ${v}`);
const num = (v, d = 4) => (typeof v === 'number' ? v.toFixed(d) : String(v));
const status = () => els.get('rates-status').textContent;
const dot = () => els.get('live-dot').className.split(' ').pop();
const mode = () => els.get('rates-mode').textContent;
const rates = () => G('rates');
const conv = (a, f, t) => a / rates()[f] * rates()[t];
const cacheDate = () => { try { return JSON.parse(store.get('exchange-rate-cache')).date; } catch (e) { return 'none'; } };
const hidden = (id) => els.get(id).classList.classes.has('hidden') ? 'hidden' : 'shown';

(async () => {
  // ── A) default: hardcoded rates, hardcoded, zero network ─────────────
  await sandbox.refreshRates();
  line('A) status', `${status()} | dot=${dot()} | ${mode()}`);
  line('A) fetch calls', `${fetchCalls} (want 0)`);
  line('A) rates', JSON.stringify(rates()));
  line('A) USD->KHR', num(conv(1, 'USD', 'KHR'), 2) + ' (want 4066.55)');
  line('A) buttons', `Latest=${hidden('update-btn')} Hardcoded=${hidden('reset-btn')}`);

  // ── B) ⬇ Latest: explicit download applies + saves ───────────────────
  await sandbox.updateRatesFromApi();
  line('B) status', `${status()} | dot=${dot()} | ${mode()}`);
  line('B) rates (live)', JSON.stringify(rates()));
  line('B) cache saved', `${cacheDate()} | history=${JSON.parse(store.get('exchange-rate-history') || '[]').length} row(s)`);
  line('B) buttons', `Latest=${hidden('update-btn')} Hardcoded=${hidden('reset-btn')}`);

  // ── C) reopen offline: downloaded rates reused, no network ───────────
  ratesOk = false;
  const before = fetchCalls;
  await sandbox.refreshRates();
  line('C) offline reload', `${status()} | ${mode()} | fetch=${fetchCalls - before} (want 0)`);

  // ── D) ↺ Hardcoded: discard the download ─────────────────────────────
  sandbox.resetToHardcoded();
  await new Promise(r => setTimeout(r, 0));
  line('D) status', `${status()} | ${mode()}`);
  line('D) cache cleared', String(!store.has('exchange-rate-cache')));
  line('D) rates', JSON.stringify(rates()));

  // ── live mode from here: un-pin KHR so the API path is exercised ─────
  G('RATE_OVERRIDES.KHR = null');
  ratesOk = true;
  store.clear();

  // ── E) live API + USD pin → KHR rescaled, cross rate preserved ───────
  await sandbox.refreshRates();
  line('E) status', `${status()} | dot=${dot()} | ${mode()}`);
  line('E) rates', JSON.stringify(rates()));
  line('E) USD->KHR', num(conv(1, 'USD', 'KHR'), 2) + ' (market cross)');
  line('E) cache saved', cacheDate());

  // applyOverrides() runs on every keystroke — must be idempotent
  const snap = JSON.stringify(rates());
  sandbox.applyOverrides();
  sandbox.applyOverrides();
  line('E) idempotent', snap === JSON.stringify(rates()) ? 'yes' : 'NO - DRIFTS');

  // ── F) rates.json wins over the API, pin still applies ───────────────
  fileOk = true;
  await sandbox.refreshRates();
  line('F) status', `${status()} | dot=${dot()}`);
  line('F) rates', JSON.stringify(rates()));
  line('F) USD->KHR', num(conv(1, 'USD', 'KHR'), 2) + ' (want 4056.00)');

  // ── G) live mode, offline, cache present ─────────────────────────────
  fileOk = false;
  ratesOk = false;
  await sandbox.refreshRates();
  line('G) offline + cache', `${status()} | dot=${dot()} | ${mode()}`);

  // ── H) live mode, offline, cache cleared → baked-in rates ────────────
  store.clear();
  await sandbox.refreshRates();
  line('H) offline, no cache', `${status()} | dot=${dot()}`);
  line('H) USD->AUD', num(conv(1, 'USD', 'AUD')));

  // ── I) small-value formatting (the 4200 KHR -> 0.0002 case) ──────────
  G('RATE_OVERRIDES.KHR = 2733.5374');
  await sandbox.refreshRates();
  line('I) 4056 KHR -> USD', sandbox.formatAmount(conv(4056, 'KHR', 'USD'), 'USD'));
  line('I) 1 KHR -> USD', sandbox.formatAmount(conv(1, 'KHR', 'USD'), 'USD'));
  line('I) 10 AUD -> USD', sandbox.formatAmount(conv(10, 'AUD', 'USD'), 'USD'));
  line('I) missing rate', sandbox.formatAmount(NaN, 'USD'));

  // ── J) history: import must not change the active rates ──────────────
  store.set('exchange-rate-history', JSON.stringify([
    { date: '2026-01-01', timestamp: 1, rates: { AUD: 1, USD: 9, KHR: 9 } },
  ]));
  const active = JSON.stringify(rates());
  sandbox.loadHistory();
  line('J) rates unchanged', active === JSON.stringify(rates()) ? 'yes' : 'NO - CLOBBERED');
  line('J) history row', els.get('history-list').innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90));
  sandbox.clearHistory();
  line('J) after clear', String(!store.has('exchange-rate-history')));

  // ── K) quick reference cards ─────────────────────────────────────────
  store.clear();
  await sandbox.refreshRates();
  sandbox.updateRefTable();
  line('K) anchor', els.get('ref-anchor').textContent);
  const cards = els.get('ref-cards').innerHTML.split('<div class="bg-gray-800/50').slice(1);
  for (const card of cards) {
    const code = (card.match(/font-semibold[^>]*>[^<]*?([A-Z]{3})<\/span>/) || [])[1];
    const rows = [...card.matchAll(/<tr class="border-t[\s\S]*?<\/tr>/g)]
      .map(r => r[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    line(`K) ${code}`, rows.join('  |  '));
  }

  // ── L) tapping a card row fills the converter ────────────────────────
  sandbox.quickFill('KHR', 'AUD', 10000);
  line('L) tap 10k KHR', `${els.get('from-amount').value} ${els.get('from-currency').value}->${els.get('to-currency').value}`);
  line('L) result', `${els.get('to-amount').textContent} ${els.get('to-currency').value} | ${els.get('conversion-detail').textContent}`);

  console.log(out.join('\n'));
})().catch(e => { console.error('HARNESS FAILED:', e); process.exit(1); });
