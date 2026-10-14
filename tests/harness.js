// Headless harness for currency-converter/index.html app logic.
// Stubs DOM + fetch, then exercises: API mode, rates.json mode, error mode,
// KHR->USD/AUD conversions, and idempotency of applyOverrides().
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const els = {};
const g = id => els[id] || (els[id] = { value: '', textContent: '', className: '', innerHTML: '', disabled: false, appendChild() {}, addEventListener() {} });
global.document = { getElementById: g, addEventListener() {}, createElement: () => ({ className: '', innerHTML: '', appendChild() {} }) };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.alert = () => {}; global.confirm = () => true;

const API = { result: 'success', time_last_update_utc: 'Wed, 14 Oct 2026 00:02:32 +0000',
  rates: { AUD: 1, USD: 0.69793, KHR: 2824.210526 } };
const FILE = { date: '2026-10-14', base: 'USD', rates: { AUD: 1.4877, USD: 1, KHR: 4056.37 } };

let mode = 'api';
global.fetch = async url => {
  if (url.includes('rates.json')) {
    if (mode === 'api' || mode === 'err') return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => FILE };
  }
  if (mode === 'err') throw new Error('network down');
  return { ok: true, status: 200, json: async () => API };
};

const test = `
const show = () => console.log('  status:', document.getElementById('rates-status').textContent,
  '\\n  rates:', JSON.stringify(rates), '\\n  USD->KHR:', (rates.KHR / rates.USD).toFixed(2),
  '| USD->AUD:', (rates.AUD / rates.USD).toFixed(4), '| source:', rateSource);

const set = (f, t, a) => { document.getElementById('from-currency').value = f;
  document.getElementById('to-currency').value = t; document.getElementById('from-amount').value = a; };

(async () => {
  mode = 'api'; await refreshRates();
  console.log('A) live API + pinned USD 0.6722'); show();

  mode = 'file'; await refreshRates();
  console.log('B) rates.json mode'); show();

  mode = 'err'; await refreshRates();
  console.log('C) both sources fail (offline, no cache)'); show();

  mode = 'api'; await refreshRates();
  console.log('D) applyOverrides() idempotency: run 3x');
  applyOverrides(); applyOverrides(); applyOverrides();
  console.log('  USD:', rates.USD, 'KHR:', rates.KHR.toFixed(4), '(must stay 0.6722 / 2720.1045)');

  console.log('E) KHR conversions (live+pin)');
  for (const [from, to, amt] of [['KHR','USD',4056],['KHR','AUD',4056],['KHR','USD',1],['USD','KHR',100],['AUD','USD',1],['USD','AUD',100]]) {
    set(from, to, amt); convert();
    console.log('  ' + amt + ' ' + from + ' -> ' + document.getElementById('to-amount').textContent + ' ' + to +
      '  | ' + document.getElementById('conversion-detail').textContent);
  }
  console.log('F) rate cards:', document.getElementById('rate-aud').textContent, '|',
    document.getElementById('rate-usd').textContent, '|', document.getElementById('rate-khr').textContent);
})();
`;
eval(src + test);
