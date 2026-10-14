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
live API ────┘                                            updateRefTable()
 (open.er-api.com, AUD base)                              convert()
                                                          saveRateSnapshot()  [API mode only]
```

| Source | Condition | Status dot | Status text |
|---|---|---|---|
| `rates.json` | file exists next to `index.html` and parses | blue | `Manual rates.json · <date>` |
| Live API | no usable `rates.json` | green | `Updated <day>` |
| Neither | both failed | red | `Error: <message>` (last known rates stay on screen) |

`refreshRates()` is the single entry point (init + the ↻ button, which calls the
`fetchRates()` alias). It tries the file first, then the API.

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
- No service worker / offline cache — first paint before the fetch resolves shows `—`.
- Tailwind Play CDN is fine for a personal tool, not for production traffic.
