# Iphone-Bot

Production-ready, asyncio-based monitor that watches **OLX** for newly listed
phones (iPhone, Samsung, Google Pixel), estimates resale profit, de-duplicates
listings with SQLite, and sends **instant Discord webhook** notifications for
the deals worth acting on.

## Features

- Continuous polling of OLX using `asyncio` + `aiohttp`, with **one independent
  loop per target** so a slow/failing target never blocks the others.
- Low-latency tuning: short base interval + random **jitter**, exponential
  **back-off** on errors, HTTP keep-alive/DNS caching, and a **decoupled
  notifier queue** so Discord delivery never slows down detection.
- Per-model rules in `config.json` (search query, max buy price, market value,
  include/exclude keywords, min price).
- Profit estimation: `market_value − price − flat_fee − market_value × pct_fee`.
  Deals are delivered **highest-profit first**.
- Drops paid/**promoted ads** (via OLX `metadata.promoted`) so the monitor only
  reacts to genuine organic listings.
- Batched SQLite de-duplication (one query + one commit per poll) so each
  listing is processed/notified once.
- Rich Discord webhook embeds with price, max-buy, estimated profit, location
  and thumbnail. Rate-limit and `429`-aware.
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
| `main.py`        | Config loading, orchestration, profit/deal logic, CLI     |
| `olx.py`         | Async OLX API client + `Listing` model                    |
| `discord.py`     | Async Discord webhook notifier (plain webhooks, no lib)   |
| `database.py`    | Async SQLite de-duplication store                          |
| `config.json`    | Runtime configuration                                      |
| `requirements.txt` | Python dependencies                                     |
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
- `targets[]` — one entry per phone model, each with `query`, `max_buy_price`,
  `market_value`, and optional `keywords_any` / `keywords_exclude` /
  `min_expected_profit` / `min_price`.
- `fees`, `min_expected_profit`, `min_listing_price` (ignore swap/parts priced
  below it), `prime_on_start`, `discord.rate_limit_seconds`.

## Run

```bash
python main.py                # uses ./config.json
python main.py path/to.json   # custom config
```

## Test

```bash
python tests/test_e2e.py      # no network/secrets required
```
