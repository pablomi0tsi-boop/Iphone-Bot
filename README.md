# Iphone-Bot

Production-ready, asyncio-based monitor that watches **OLX** for newly listed
iPhones, identifies each listing's **model + storage**, matches it against your
**expected resale price list**, and sends **instant Discord webhook**
notifications for every profitable listing.

## Matching logic

A listing is **ignored** when any of these hold:

- it is a paid **promoted ad** (dropped upstream via OLX `metadata.promoted`),
- its title/description contains a `blacklist_keywords` term — including swap
  words (`zamienię`, `zamiana`, `swap`, `wymiana`, `trade`) and condition/lock
  words (`icloud`, `blokada`, `mdm`, `na części`, `uszkodzony`, `zbity`,
  `czytaj opis`, `locked`, `for parts`),
- its title/description contains an `accessory_keywords` term (`etui`, `case`,
  `pokrowiec`, `szkło`, `szybka`, `wyświetlacz`, `ekran`, `lcd`, `oled`,
  `bateria`, `taśma`, `płyta`, `części`, `housing`, `obudowa`, `ładowarka`,
  `kabel`, `airpods`, `apple watch`),
- its **price is `0`** (or missing),
- it has **no photos** attached,
- the seller is a **business account** (when OLX reports the seller type),
- the **model or storage cannot be determined confidently** (structured OLX
  attributes `phonemodel` / `builtinmemory_phones` first, then unambiguous
  title/description parsing; storage understands `128`, `128gb`, `128 gb`,
  `128g`, `256`, `512`, `1tb`, `1 tb`, `1024gb`), or
- no `resale_prices` entry exists for the detected `model + storage`.

Otherwise the profit is `profit = resale_price − listing_price`, and a Discord
notification is sent when `profit >= minimum_profit` (default **300 PLN**). Deals
are delivered **highest-profit first**.

> ⚠️ Some `accessory_keywords` (`bateria`, `ekran`, `wyświetlacz`, `szkło`, ...)
> also appear in legitimate phone listings ("bateria 100%"), so they reduce
> recall (measured ~30% fewer deals in live sampling). They are matched in
> title **and** description as requested; remove specific words from
> `accessory_keywords` in `config.json` if you prefer higher recall.

> The `resale_prices` in `config.json` hold your configured PLN resale values;
> keep them up to date as the market moves.

## Statistics

Every `stats_interval_seconds` (default **600s / 10 min**) a cumulative line is
logged: listings checked, deals found, notifications sent, and average profit. A
final line is emitted on shutdown.

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
- `blacklist_keywords` / `accessory_keywords` — listing skipped if any appears
  in title/description.
- `minimum_profit` — notify when `resale − price >= minimum_profit` (default
  `300`).
- `stats_interval_seconds` — how often to log statistics (default `600`).
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
