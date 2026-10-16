# Exchange Rate Converter (AUD · USD · KHR)

A browser app that converts money between AUD (Australian dollar), USD (US dollar), and
KHR (Cambodian riel). `index.html` holds the markup, the styles, and the logic. There is no
build step. The Tailwind runtime is vendored at `vendor/tailwind.js`, so the page loads
nothing from a CDN.

The app uses **hardcoded rates by default** (`RATE_OVERRIDES`). It needs no network. The
**⬇ Latest** button brings in fresh rates from the API (application programming interface)
when you want them.

## Deployed site

**https://adamjen.github.io/currency-converter/** — public repo, GitHub Pages, branch `main`,
path `/`.

### Install on a phone

A service worker needs HTTPS. GitHub Pages provides it. A LAN address and `file://` do not, so
neither can install the app.

**Android (Chrome):**

1. Open the URL in Chrome.
2. Press **⋮** (the three-dot menu).
3. Press **Add to home screen**.
4. Open the icon once while you have signal.

**iPhone (Safari):**

1. Open the URL in Safari.
2. Press **Share**.
3. Press **Add to Home Screen**.
4. Open the icon once while you have signal.

`sw.js` stores the app shell in the browser cache. After step 4 the app opens with no network
at all. Other browsers on iPhone use the same engine as Safari, so Safari is the normal choice.

### Redeploy

1. Run `git push origin main`.
2. Change `VERSION` in `sw.js` (`v3` → `v4`) and push again.

Step 2 is necessary. If you skip it, an installed copy keeps the old shell from its cache.
Pages needs about 30 seconds to build. Check it with:

```bash
gh api repos/adamjen/currency-converter/pages --jq .status   # → built
```

## Run it locally

```bash
python3 -m http.server 8090 -d /home/adam/projects/currency-converter
# → http://localhost:8090
```

Serve the files over HTTP. Do not open `index.html` from disk. Under `file://` the browser
blocks `fetch()`, so the **⬇ Latest** download and `rates.json` both fail.

## Rate convention

The `rates` object always answers one question: **"What is 1 AUD worth in `<currency>`?"**

```js
rates = { AUD: 1, USD: 0.6722, KHR: 2733.5374 }   // 1 AUD = 0.6722 USD = 2733.54 KHR
```

`convert()` uses one formula for every pair:

```js
amountInAud = amount / rates[from];
result      = amountInAud * rates[to];
```

The three currencies are symmetric. KHR→USD works exactly like USD→KHR.

## Rate pipeline

`allPinned()` selects the mode:

- Every currency has a number in `RATE_OVERRIDES` → **hardcoded mode**. The page uses no
  network unless you press **⬇ Latest**.
- Any value is `null` → **live mode**. The app tries each source in order and falls back
  instead of failing.

```
hardcoded mode:  RATE_OVERRIDES ─┐
                                 ├─→ liveRates ─→ applyOverrides() ─→ rates ─→ display/convert
downloaded set:  localStorage ───┘        ↑
live mode:  rates.json → API → localStorage cache → EMBEDDED_RATES
```

| Source | Condition | Status dot | Status text |
|---|---|---|---|
| `RATE_OVERRIDES` | all pinned, nothing downloaded | blue | `Hardcoded rates · as of <date>` |
| downloaded set | all pinned, after **⬇ Latest** (saved) | amber | `Downloaded rates · <date>` |
| `rates.json` | live mode, file next to `index.html` parses | blue | `Manual rates.json · <date>` |
| Live API | live mode, network available | green | `Updated <date>` |
| localStorage cache | live mode, API failed, rates seen before | amber | `Offline · cached <date>` |
| `EMBEDDED_RATES` | live mode, API failed, nothing cached | amber | `Offline · built-in rates from <date>` |
| None | API failed and the baked-in set is broken | red | `Error: <message>` |

`refreshRates()` is the only entry point. It runs at start-up and when you press ↻ Refresh
(the button calls the `fetchRates()` alias). Every successful API fetch is written to
`localStorage['exchange-rate-cache']`. If a later fetch fails, the app shows the newest rates
it has already seen. The subtitle under the title always names the active set: *fixed rates*,
*downloaded rates*, or *live rates*.

## Hardcoded rates

```js
const RATE_OVERRIDES = { AUD: 1, USD: 0.6722, KHR: 2733.5374 };
const RATES_AS_OF = '15 Oct 2026';
```

USD is pinned at 0.6722 by request. KHR is pinned so that `1 USD = 4,066.55 KHR`, which is the
market cross rate on that date (`2837.763158 × 0.6722 / 0.69783`). In this mode
`applyOverrides()` changes nothing, because the source is already the pinned set.

### ⬇ Latest

This button appears only in hardcoded mode. It is the only control that uses the network.

1. It fetches the API.
2. It applies the result immediately.
3. It saves the result to `localStorage`.

Every later open reuses the saved set, online or offline.

### ↺ Hardcoded

This button appears after you save a download. It deletes the saved set and returns to the
numbers in the file.

### Other changes

- To make one currency live again, set it to `null`. Live mode starts again, and the remaining
  pins apply on top of it. See *Pinning a rate*.
- To move the hardcoded set itself, run `node bake-rates.js --hardcode`. It keeps the USD pin,
  re-derives KHR from the market cross rate, and updates `RATES_AS_OF`.

## Offline options

Three options, best first:

1. **Pages + service worker.** Open the URL once, add the app to your home screen, and the
   browser caches the shell, including `vendor/tailwind.js`. Rates are hardcoded, so nothing
   else is needed. Press **⬇ Latest** with signal to refresh them.
2. **Copy the files.** `index.html` alone converts correctly but shows no styling offline. Copy
   `index.html`, `vendor/`, `icons/`, `manifest.webmanifest`, and `sw.js` to keep the same look.
   Chrome on Android opens the copy from the Files app. On iOS, a `file://` page has no access
   to `localStorage`, so history and downloads do not persist there. Use Pages on iOS.
3. **`EMBEDDED_RATES`.** This is the last-resort set inside the script. Live mode uses it only
   when every other source fails. Refresh it with `node bake-rates.js`.

## Pinning a rate (live mode)

In live mode, a pinned currency makes `applyOverrides()` rescale the other live currencies by
the same ratio before it pins the value:

```
scale = pinned / live            // 0.6722 / 0.69783 = 0.96327
rates.KHR = live.KHR * scale     // 2837.76 → 2733.54
```

This keeps cross rates correct. `1 USD = 2733.54 / 0.6722 = 4,066.55 KHR`, which matches the
market. If you pin one rate and leave the rest alone, you get `2837.76 / 0.6722 = 4,190.35` —
a 3.0% error. `applyOverrides()` rebuilds `rates` from `liveRates` on every call, so it is
idempotent. It is safe to run twice, including from the error path.

## rates.json

This file gives you fixed rates without a code change. Copy `rates.json.example`. Git ignores
`rates.json` because it is machine-local state.

```json
{ "date": "2026-10-14", "base": "USD",
  "rates": { "AUD": 1.4877, "USD": 1, "KHR": 4056.37 } }
```

- `base` names the currency that 1 unit is quoted in. It can be AUD, USD, or KHR.
- The app divides every value by the `AUD` entry, so a USD-based file is correct.
- You may put the rates at the top level and omit `rates`.
- `date` is for display only.
- `RATE_OVERRIDES` still applies on top of the file.
- The app does not write history snapshots in `rates.json` mode. Manual numbers stay out of the
  rate history.

## Number formatting

`formatAmount(n, currency, isRate)` — dp means decimal places:

| Value | Amount box | Rate line |
|---|---|---|
| below 1 | 6 significant digits (`0.000247124`) | 6 significant digits |
| KHR | 0 dp (whole riel) | 2 dp |
| AUD, USD | 2 dp (`10.00`, not `10.0000`) | 4 dp (`1 USD = 1.4877 AUD`) |

The 6-significant-digit rule prevents `1 KHR → USD` from rounding to `0.0002`.

`fmt()` and `convert()` show `—` instead of `NaN` when a currency has no rate yet. This happens
to the KHR card before the first fetch finishes.

## Quick Reference cards

Three cards, one per source currency, driven by `REF_PRESETS`. Amounts are round numbers only:
AUD 10/50/100, USD 5/10/50, and KHR 10000/20000/50000. Those KHR values are real Cambodian note
denominations. Each card has three rows, so the cards line up.

The line under the heading gives the mental anchor, rounded to the nearest 100 riel:

```
A$1 ≈ 2,700 riel · US$1 ≈ 4,100 riel · 10,000 riel ≈ A$3.66 / US$2.46
```

Press a row to put that amount into the converter (`quickFill()`). The cards use 2 dp for AUD
and USD, and 0 dp for KHR. They are deliberately rougher than the converter box, which uses
`formatAmount()`.

## Input and events on mobile

The converter is a `<form id="convert-form">`. Submitting it — the **Go** or **Enter** key on a
soft keyboard — calls `convert()` and removes focus from the field, which closes the keyboard.
`convert()` also runs on `input` and `change` on the amount field, and on `change` on both
selects. Typing, autofill, IME (input method editor) commit, and a currency change each update
the result on their own. A **Convert** button is there for touch use. `type="number"`,
`inputmode="decimal"`, and `enterkeyhint="go"` give a numeric keypad with a Go key on iOS and
Android. None of this depends on ↻ Refresh; that button only fetches rates.

### Swap button

The ⇄ **Swap** button exchanges the two currencies and moves the result into the amount box.
For example, 10 AUD gives 6.72 USD. After you press Swap, the amount box shows 6.72 and the
currencies reverse. An empty amount box stays empty.

The button reuses the rounding of the result box (`roundForDisplay()`: whole riel for KHR,
2 dp otherwise). The number you swap is the number you saw. Swap twice and the app shows the
original amount: 10 AUD → 27,335 KHR → Swap → 27,335 KHR → 10.00 AUD.

## Rate history

The app stores history in `localStorage['exchange-rate-history']` as
`[{ date, timestamp, rates }]`. Newest first, maximum 90 entries, one entry per `date`. A
successful live-API refresh writes an entry, including a **⬇ Latest** download. The list shows
the newest 20.

- **Export** / **Import** move that history array as JSON. Import does not change the active
  rates. Only **⬇ Latest**, `rates.json`, or `RATE_OVERRIDES` change them.
- **Clear** deletes `localStorage` after a confirm dialog.

## Tests

```bash
node tests/harness.js
```

The harness extracts the inline `<script>` straight out of `index.html`, so it cannot drift
from the app. It stubs `document`, `localStorage`, and `fetch`, then prints one line per
scenario, A to M:

- A–D: hardcoded mode with zero fetch calls, then **⬇ Latest** download, offline reuse of the
  saved set, and ↺ Hardcoded.
- E–H: live mode (`RATE_OVERRIDES.KHR = null`) — API with the USD pin and the KHR rescale,
  `rates.json` (base USD) over the API, offline with a cache, and offline with the baked-in set.
- I: small-value formatting, including the `1 KHR → USD` case.
- J: history import must not change the active rates.
- K–L: the Quick Reference cards and a card tap.
- M: Swap — AUD/USD round trip, KHR rounding, and an empty amount.

A thrown error exits non-zero. Otherwise check the printed table against the values above.

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

1. Add the code to `CURRENCIES`, `FLAGS`, and `NAMES` near the top of the script.
2. Add an `<option>` to both the From and the To selects.
3. Add a card to `#rates-display` and to `updateRatesDisplay()` if it needs a headline rate.
4. Add it to `RATE_OVERRIDES`. Give it a number to stay offline, or `null` to keep it live.

## Known limits

- Hardcoded rates do not refresh themselves. They stay at `RATES_AS_OF` until you press
  **⬇ Latest** or run `node bake-rates.js --hardcode`.
- The service worker serves the shell from the cache first. An installed copy shows the old app
  until you bump `VERSION` in `sw.js` and Pages rebuilds.
- Cache-first also means a hand-edited `rates.json` on a hosted site appears only after a
  `VERSION` bump. In hardcoded mode the app ignores `rates.json` completely.
- The free `open.er-api.com` endpoint updates about once a day. Its own USD↔KHR cross rate
  differs from the AUD-based cross rate the app fetches by about 0.2%.
- The vendored Tailwind Play runtime compiles class names in the browser. Acceptable for a
  personal tool. Do not use it for production traffic.
