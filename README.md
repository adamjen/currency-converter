# Exchange Rate Converter (AUD · USD · KHR)

Single-file browser app — `index.html` holds the markup, styles and logic. No build step; the
Tailwind runtime is vendored at `vendor/tailwind.js` so nothing is fetched from a CDN.

Rates are **hardcoded by default** (`RATE_OVERRIDES`), so the page works with no network at
all. A **⬇ Latest** button pulls fresh rates from the API when you feel like it.

## Deployed — GitHub Pages

**https://adamjen.github.io/currency-converter/** (public repo, Pages from `main` / root).

On the phone: open the URL in Chrome → ⋮ → **Add to home screen** (iOS: Share → Add to Home
Screen). `sw.js` precaches the shell, so after that first online open it launches in airplane
mode. Service workers need HTTPS, which is exactly what Pages provides — the LAN IP and
`file://` cannot register one.

**Redeploy:** `git push origin main`. Then bump `VERSION` in `sw.js` (`v1` → `v2`) and push
again — otherwise installed copies keep serving the cached shell. Pages takes ~30 s to build;
`gh api repos/adamjen/currency-converter/pages --jq .status` says `built`.

## Run it locally

```bash
python3 -m http.server 8090 -d /home/adam/projects/currency-converter
# → http://localhost:8090
```

Serve it locally over HTTP rather than opening `index.html` from disk: under `file://` the
browser blocks `fetch()`, so the ⬇ Latest download and `rates.json` both fail.

## The one convention everything depends on

`rates` is always **"what 1 AUD is worth in `<currency>`"**:

```js
rates = { AUD: 1, USD: 0.6722, KHR: 2733.5374 }   // 1 AUD = 0.6722 USD = 2733.54 KHR
```

Any conversion is `amount / rates[from] * rates[to]` (`convert()`), so the three currencies
are fully symmetric — KHR→USD works exactly like USD→KHR.

## Rate pipeline

`allPinned()` picks the mode. All three currencies have a number → **hardcoded mode**: the
page never touches the network unless you tap ⬇ Latest. Any `null` in `RATE_OVERRIDES` →
**live mode**, which tries each source in order and degrades instead of failing:

```
hardcoded mode:  RATE_OVERRIDES ─┐
                                 ├─→ liveRates ─→ applyOverrides() ─→ rates ─→ display/convert
downloaded set:  localStorage ───┘        ↑
live mode:  rates.json → API → localStorage cache → EMBEDDED_RATES
```

| Source | Condition | Status dot | Status text |
|---|---|---|---|
| `RATE_OVERRIDES` | all pinned, nothing downloaded | blue | `Hardcoded rates · as of <date>` |
| downloaded set | all pinned, after ⬇ Latest (saved) | amber | `Downloaded rates · <date>` |
| `rates.json` | live mode, file next to `index.html` parses | blue | `Manual rates.json · <date>` |
| Live API | live mode, network up | green | `Updated <date>` |
| localStorage cache | live mode, API failed, rates seen online before | amber | `Offline · cached <date>` |
| `EMBEDDED_RATES` | live mode, API failed, nothing cached | amber | `Offline · built-in rates from <date>` |
| None of the above | API failed and the baked-in set is broken | red | `Error: <message>` |

`refreshRates()` is the single entry point (init + the ↻ button, which calls the
`fetchRates()` alias). Every successful API fetch is written to
`localStorage['exchange-rate-cache']`, so the app falls back to the freshest rates it has seen
instead of showing nothing. The subtitle under the title always names the active set: *fixed
rates* / *downloaded rates* / *live rates*.

## Hardcoded rates — and downloading fresh ones

```js
const RATE_OVERRIDES = { AUD: 1, USD: 0.6722, KHR: 2733.5374 };
const RATES_AS_OF = '15 Oct 2026';
```

USD is pinned at 0.6722 by request; KHR is pinned so `1 USD = 4,066.55 KHR`, the market cross
on that date (`2837.763158 × 0.6722 / 0.69783`). In this mode `applyOverrides()` is a no-op —
the source *is* the pinned set.

- **⬇ Latest** (shown in this mode only) fetches the API, applies it immediately, and saves it
  to `localStorage`, so every later open — online or not — reuses it. That button is the only
  thing that uses the network.
- **↺ Hardcoded** (shown once a download is saved) throws the download away and goes back to
  the numbers in the file.
- To make one currency live again, set it to `null` — the live chain comes back on and the
  remaining pins are applied on top (see *Pinning a rate*).
- To move the hardcoded set itself: `node bake-rates.js --hardcode` (keeps the USD pin, re-derives
  KHR from the market cross, updates `RATES_AS_OF`).

## Offline

Three layers, best first:

1. **Pages + service worker** (recommended). Open the URL once, add to home screen, and the
   shell — including `vendor/tailwind.js` — is cached. Rates are hardcoded, so nothing else is
   needed. Tapping ⬇ Latest with signal refreshes them and the response is cached too.
2. **Copy the files.** `index.html` alone converts fine but renders unstyled offline; copy
   `index.html` + `vendor/` + `icons/` + `manifest.webmanifest` + `sw.js` to get the same look.
   On Android, Chrome opens it from the Files app; iOS gives a `file://` page no `localStorage`,
   so history and downloads will not persist there — use Pages on iOS.
3. **`EMBEDDED_RATES`** is the last-resort set inside the script, used only in live mode when
   every source failed. Refresh with `node bake-rates.js`.

Hardcoded rates never refresh themselves — the status line always says how old they are.

## Pinning a rate (live mode)

With a `null` in `RATE_OVERRIDES` the app is in live mode, and a pinned currency makes
`applyOverrides()` **rescale the other live currencies by the same ratio** before pinning:

```
scale = pinned / live            // 0.6722 / 0.69783 = 0.96327
rates.KHR = live.KHR * scale     // 2837.76 → 2733.54
```

That keeps cross rates honest: 1 USD = 2733.54 / 0.6722 = **4,066.55 KHR** (market), instead of
2837.76 / 0.6722 = 4,190.35 (+3.0% drift) which is what you get if you pin one rate and leave
the rest untouched. `applyOverrides()` rebuilds `rates` from `liveRates` every call, so it is
idempotent — safe to re-run, including from the error path.

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
A$1 ≈ 2,700 riel · US$1 ≈ 4,100 riel · 10,000 riel ≈ A$3.66 / US$2.46
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
first, capped at 90 entries, deduped by `date`. Written on each successful live-API refresh
(including a ⬇ Latest download). Export/Import buttons move that **history** array as JSON —
importing does *not* change the active rates; only ⬇ Latest, `rates.json` or `RATE_OVERRIDES`
do that. Clear wipes localStorage after a confirm.

## Tests

```bash
node tests/harness.js
```

Headless: extracts the inline `<script>` straight out of `index.html` (so it can't drift),
stubs `document` / `localStorage` / `fetch`, and prints one line per scenario: hardcoded mode
(asserting **zero** fetch calls), ⬇ Latest download → saved → reused offline → ↺ Hardcoded,
then live mode (`RATE_OVERRIDES.KHR = null`) through the API, `rates.json` (base USD), the
offline cache and the baked-in fallback, plus `applyOverrides()` idempotency, small-value
formatting, history import, and the rendered cheat cards. A thrown error exits non-zero;
otherwise eyeball the table.

## Files

```
index.html              the app
vendor/tailwind.js      Tailwind runtime, vendored (re-download: curl -sL -A Mozilla/5.0 \
                        https://cdn.tailwindcss.com/3.4.1 -o vendor/tailwind.js)
sw.js                   offline shell cache — bump VERSION on deploy
manifest.webmanifest    home-screen install metadata
icons/                  generated by make-icons.py (Pillow + DejaVu)
bake-rates.js           refresh EMBEDDED_RATES, or RATE_OVERRIDES with --hardcode
make-icons.py           regenerate the app icons
tests/harness.js        headless smoke test
rates.json.example      optional fixed-rate file
```

## Adding a currency

1. `CURRENCIES`, `FLAGS`, `NAMES` near the top of the script
2. `<option>` in both the From and To selects
3. a card in `#rates-display` + `updateRatesDisplay()` if it needs a headline rate
4. `RATE_OVERRIDES` — give it a number to stay offline, or `null` to keep it live

## Known limits

- Hardcoded rates never refresh themselves — the numbers are as of `RATES_AS_OF` until you tap
  ⬇ Latest or re-run `bake-rates.js --hardcode`.
- The service worker serves the cached shell cache-first, so an installed copy shows the old
  app until `sw.js` `VERSION` is bumped and Pages rebuilds.
- Same-origin cache-first also means a hand-edited `rates.json` on a hosted site is only picked
  up after a `VERSION` bump (the app ignores `rates.json` entirely in hardcoded mode).
- The free `open.er-api.com` endpoint updates roughly once a day, and its own USD↔KHR cross
  differs ~0.2% from the AUD-based cross the app fetches.
- Tailwind Play runtime (vendored) compiles classes in the browser — fine for a personal tool,
  not for production traffic.
