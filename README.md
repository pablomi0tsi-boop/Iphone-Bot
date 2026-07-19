# Iphone-Bot

Production-ready, asyncio-based monitor that watches **OLX** for newly listed
iPhones, identifies each listing's **model + storage**, matches it against your
**expected resale price list**, and sends **instant Discord webhook**
notifications for every profitable listing.

## Matching logic

For each new listing:

1. **Blacklist filter** — skipped if the title/description contains any
   `blacklist_keywords` term (iCloud lock, `blokada`, `mdm`, `na części`,
   `uszkodzony`, `zbity`, `czytaj opis`, `locked`, `for parts`, ...).
2. **Model + storage detection** — from OLX's structured attributes
   (`phonemodel`, `builtinmemory_phones`) when present, otherwise by parsing the
   title then the description. **If the storage (or model) cannot be determined
   unambiguously, the listing is ignored.**
3. **Resale lookup** — the detected `model + storage` is looked up in
   `resale_prices`. No configured price ⇒ ignored.
4. **Profit** — `profit = resale_price − listing_price`. A Discord notification
   is sent when `profit > min_profit` (default **1 PLN**). Deals are delivered
   **highest-profit first**.

> ⚠️ **The `resale_prices` in `config.json` are EXAMPLE values.** Replace every
> number with your own expected resale prices before relying on notifications.

> ⚠️ OLX reports swap/trade ("Zamienię") listings with `price = 0`, which yields
> `profit = resale`. Per spec every listing with `profit > 1` notifies, so these
> appear as deals; add a price floor in your fork if you want to exclude them.

## Features

- Continuous polling of OLX using `asyncio` + `aiohttp`, with **one independent
  loop per search query** so a slow/failing query never blocks the others.
- Low-latency tuning: short base interval + random **jitter**, exponential
  **back-off** on errors, HTTP keep-alive/DNS caching, and a **decoupled
  notifier queue** so Discord delivery never slows down detection.
- Confidence-based model/storage parsing (`pricing.py`) using structured OLX
  attributes and title/description text.
- Structured `resale_prices` table keyed by model then storage (`"128"`,
  `"256GB"` or `"1TB"` all accepted).
- Drops paid/**promoted ads** (via OLX `metadata.promoted`).
- Batched SQLite de-duplication (one query + one commit per poll).
- Rich Discord embeds with model+storage, listing price, resale price, profit,
  location and thumbnail. Rate-limit and `429`-aware.
- "Prime on start" (only on a fresh database) so the existing back-catalogue is
  recorded silently and only genuinely new listings trigger notifications.
- Graceful shutdown on `SIGINT`/`SIGTERM`.

## Detection latency & limitations

OLX offers **no official/public real-time API and no push mechanism**, so
polling is the only option. This client uses OLX's internal JSON API
(`/api/v1/offers/`) — an unofficial endpoint that can change or throttle without
notice. Verified limitations that shape latency:

- **No reliable "newest first" order.** The API honours price sorting
  (`filter_float_price:asc|desc`) but **silently ignores `created_at` sorting**
  (both directions return identical, non-chronological results). Detection
  therefore relies on de-duplicating every organic result against SQLite, not on
  ordering.
- **Search-index lag is server-side and uncontrollable.** A brand-new listing
  only becomes detectable once OLX surfaces it in the search API; this can add
  seconds to a few minutes that no client can remove.
- **Polling cadence bounds latency.** Expected delay ≈ `poll_interval/2` +
  request time (~0.4–0.5 s) + Discord POST (~0.2–0.5 s) + OLX index lag. With
  the default 10 s interval that is typically ~5–11 s plus index lag.
- **Rate-limit risk.** Polling too aggressively from one IP risks throttling or
  a temporary block; back-off keeps the monitor stable when that happens.

## Project layout

| File             | Responsibility                                             |
| ---------------- | ---------------------------------------------------------- |
| `main.py`        | Config loading, orchestration, matching/profit logic, CLI |
| `olx.py`         | Async OLX API client + `Listing` model                    |
| `pricing.py`     | Model/storage detection + resale `PriceBook` lookup       |
| `discord.py`     | Async Discord webhook notifier (plain webhooks, no lib)   |
| `database.py`    | Async SQLite de-duplication store                          |
| `config.json`    | Runtime configuration + resale price list                 |
| `requirements.txt` | Python dependencies                                     |
| `tests/test_pricing.py` | Unit tests for the parser + `PriceBook`            |
| `tests/test_e2e.py` | End-to-end test against a local fake OLX + webhook     |

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configure

Edit `config.json`:

- `discord.webhook_url` — your Discord webhook URL. Leave empty to run in
  **dry-run** mode (deals are logged instead of sent).
- `olx.base_url` — OLX API endpoint for your country domain (default `olx.pl`).
- `olx.poll_interval_seconds` — base seconds between polls per target (default
  `10`). Lower = faster detection but higher throttling risk.
- `olx.jitter_seconds`, `olx.max_backoff_seconds` — jitter added to each poll and
  cap for exponential back-off on errors.
- `olx.pages_per_poll` — pages of 40 organic results per poll (default `1`).
  Raise to widen coverage of new listings at the cost of more requests.
- `olx.include_promoted` — set `true` to keep promoted ads (default `false`).
- `olx.sort_by` — optional; only price sorting works server-side. Leave `null`.
- `olx.search_queries` — list of search terms used to poll OLX (one poll loop
  each), e.g. `["iphone 13", "iphone 15 pro"]`. Model/storage are parsed per
  listing, independently of the query.
- `resale_prices` — **your** expected resale prices, `{ "<model>": { "<storage>":
  price } }`. Storage keys accept `"128"`, `"256GB"` or `"1TB"`.
- `blacklist_keywords` — listing skipped if any appears in title/description.
- `min_profit` — notify when `resale − price` exceeds this (default `1`).
- `prime_on_start`, `discord.rate_limit_seconds`.

## Run

```bash
python main.py                # uses ./config.json
python main.py path/to.json   # custom config
```

## Test

```bash
python tests/test_pricing.py  # parser + PriceBook units
python tests/test_e2e.py      # full pipeline; no network/secrets required
```
