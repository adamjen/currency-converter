# Exchange Rate Converter (AUD · USD · KHR)

Single-file browser app — `index.html` holds the markup, styles and logic. No build step,
no dependencies beyond two CDNs (Tailwind Play CDN + Google Fonts).

## Run it

```bash
python3 -m http.server 8090 -d /home/adam/projects/currency-converter
# → http://localhost:8090
```

Serve it over HTTP rather than opening `index.html` from disk: under `file://` the browser
blocks `fetch()`, so `rates.json` loading fails (harmless — it falls back to the API) and
some browsers also block the API call.

## The one convention everything depends on

`rates` is always **"what 1 AUD is worth in `<currency>`"**:

```js
rates = { AUD: 1, USD: 0.6722, KHR: 2720.09 }   // 1 AUD = 0.6722 USD = 2720.09 KHR
```

Any conversion is `amount / rates[from] * rates[to]` (`convert()`), so the three currencies
are fully symmetric — KHR→USD works exactly like USD→KHR.

## Rate pipeline

```
rates.json  ─┐
             ├─→ liveRates ─→ applyOverrides() ─→ rates ─→ updateRatesDisplay()
live API ────┘        ↑                                convert()
 (open.er-api.com,     └─ localStorage cache           updateRefTable()
  AUD base)              └─ EMBEDDED_RATES (baked in)  saveRateSnapshot()  [API mode only]
```

| Source | Condition | Status dot | Status text |
|---|---|---|---|
| `rates.json` | file next to `index.html` parses | blue | `Manual rates.json · <date>` |
| Live API | no usable `rates.json`, network up | green | `Updated <date>` |
| localStorage cache | API failed, rates seen online before | amber | `Offline · cached <date>` |
| `EMBEDDED_RATES` | API failed, nothing cached | amber | `Offline · built-in rates from <date>` |
| None of the above | API failed and the baked-in set is broken | red | `Error: <message>` |

`refreshRates()` is the single entry point (init + the ↻ button, which calls the
`fetchRates()` alias): file → API → cache → baked-in. Every successful API fetch is written
to `localStorage['exchange-rate-cache']`, so the app degrades to the freshest rates it has
seen instead of showing nothing.

## Offline on your phone

The page needs no server and no network once it has rates — the amber status lines above are
fully functional, just stale.

1. Re-bake the fallback rates so they are not months old:
   ```bash
   node bake-rates.js     # rewrites EMBEDDED_RATES in index.html from the live API
   ```
2. Copy `index.html` to the phone (Drive, `scp`, USB — it is one self-contained file).
3. Open it from the phone's file manager (or Chrome → open file). No internet needed; the
   status bar reads `Offline · built-in rates from <date>`.

Notes:
- If you open it from a real URL instead, the browser also caches the last rates it fetched,
  so later offline opens show `Offline · cached <date>` — fresher than the baked-in set.
- `localStorage` is per-origin, and `file://` origins are quirky across browsers, so treat the
  baked-in rates as the guaranteed offline path.
- A service worker / installable PWA would cache the *page* too, but service workers only
  register on HTTPS or localhost — `http://192.168.0.x` will not work. Needs hosting.
- Rates drift. Re-bake and re-copy before a trip; the status line always shows how old they are.

## Pinning a rate

`RATE_OVERRIDES` at the top of the script pins currencies; `null` means "keep it live":

```js
const RATE_OVERRIDES = { AUD: 1, USD: 0.6722, KHR: null };
```

When a currency is pinned, `applyOverrides()` **rescales the other live currencies by the
same ratio** before pinning:

```
scale = pinned / live            // 0.6722 / 0.69793 = 0.9631
rates.KHR = live.KHR * scale     // 2824.21 → 2720.09
```

That keeps cross rates honest: 1 USD = 2720.09 / 0.6722 = **4,046.55 KHR** (market), instead
of 2824.21 / 0.6722 = 4,201.44 (+3.6% drift) which is what you get if you pin one rate and
leave the rest untouched. `applyOverrides()` rebuilds `rates` from `liveRates` every call, so
it is idempotent — safe to re-run, including from the error path.

## rates.json (fixed rates without touching code)

```json
{ "date": "2026-10-14", "base": "USD",
  "rates": { "AUD": 1.4877, "USD": 1, "KHR": 4056.37 } }
```

- `base` is the currency 1 unit is quoted in — any of AUD/USD/KHR. Values are normalised to
  the AUD convention by dividing through the `AUD` entry, so a USD-based file is fine.
- `rates` may be omitted (values at top level); `date` is display-only.
- `RATE_OVERRIDES` still applies on top of the file.
- Copy from `rates.json.example`. It is git-ignored — it is machine-local state.
- History snapshots are **not** written in `rates.json` mode (manual numbers shouldn't
  pollute the rate history).

## Number formatting

`formatAmount(n, currency, isRate)`:
- `|n| < 1` → 6 significant digits, so `1 KHR → USD` shows `0.000247124` instead of rounding
  to `0.0002`
- KHR → 0 dp for amounts, 2 dp for rate lines
- otherwise 4 dp (2 dp above 1000)

`fmt()` / `convert()` render `—` rather than `NaN` when a currency has no rate yet (e.g. the
KHR card before the first fetch resolves).

## Quick Reference (cheat sheet)

Three cards, one per source currency, driven by `REF_PRESETS` — round amounts only: AUD
10/50/100, USD 5/10/50, and KHR 10k/20k/50k (real Cambodian note denominations). Three rows
each so the cards line up.

The line under the heading is the mental anchor, rounded to the nearest 100 riel:

```
A$1 ≈ 2,700 riel · US$1 ≈ 4,000 riel · 10,000 riel ≈ A$3.68 / US$2.47
```

Tapping a row loads that amount into the converter (`quickFill()`). Cheat-sheet cells use 2 dp
for AUD/USD and 0 dp for KHR — deliberately rougher than the converter box, which uses
`formatAmount()`.

## Input & events (mobile)

The converter is a `<form id="convert-form">`; submitting it — the soft keyboard's **Go** /
**Enter** — calls `convert()` and blurs the field to dismiss the keyboard. `convert()` is also
wired to `input` **and** `change` on the amount field and `change` on both selects, so typing,
autofill, IME commit and currency switching all update the result on their own. There is an
explicit **Convert** button for touch use, and `type="number"` + `inputmode="decimal"` +
`enterkeyhint="go"` give the numeric keypad with a Go key on iOS/Android. Nothing here depends
on ↻ Refresh — that only re-fetches rates.

## Rate history

Stored in `localStorage['exchange-rate-history']` as `[{ date, timestamp, rates }]`, newest
first, capped at 90 entries, deduped by `date`. Written automatically on each successful
live-API refresh. Export/Import buttons move that **history** array as JSON — importing does
*not* change the active rates; only `rates.json` or `RATE_OVERRIDES` do that. Clear wipes
localStorage after a confirm.

## Tests

```bash
node tests/harness.js
```

Headless: extracts the inline `<script>` straight out of `index.html` (so it can't drift),
stubs `document` / `localStorage` / `fetch`, and drives `refreshRates()` + `convert()` through
live-API mode, `rates.json` mode, total-offline mode, `applyOverrides()` idempotency, and the
KHR-direction conversions. It prints the resulting status line, `rates` object and conversions
per scenario — a thrown error exits non-zero, otherwise eyeball the table.

## Adding a currency

1. `CURRENCIES`, `FLAGS`, `NAMES` near the top of the script
2. `<option>` in both the From and To selects
3. a card in `#rates-display` + `updateRatesDisplay()` if it needs a headline rate
4. `RATE_OVERRIDES` — add it with `null` unless you want it pinned

## Known limits

- The free `open.er-api.com` endpoint updates roughly once a day, and its own USD↔KHR cross
  differs ~0.2% from the AUD-based cross the app fetches.
- No service worker: the **rates** work offline, but the page itself must be cached by the
  browser or copied onto the device. First paint before any source resolves shows `—`.
- Tailwind Play CDN is fine for a personal tool, not for production traffic.
