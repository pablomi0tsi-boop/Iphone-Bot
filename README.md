# Iphone-Bot

Production-ready, asyncio-based monitor that watches **OLX** for newly listed
phones (iPhone, Samsung, Google Pixel), estimates resale profit, de-duplicates
listings with SQLite, and sends **instant Discord webhook** notifications for
the deals worth acting on.

## Features

- Continuous, concurrent polling of OLX using `asyncio` + `aiohttp`.
- Per-model rules in `config.json` (search query, max buy price, market value,
  include/exclude keywords).
- Profit estimation: `market_value − price − flat_fee − market_value × pct_fee`.
- SQLite-backed de-duplication so each listing is only processed/notified once.
- Rich Discord webhook embeds with price, max-buy, estimated profit, location
  and thumbnail. Rate-limit and `429`-aware.
- "Prime on start" mode so the existing back-catalogue is recorded silently and
  only genuinely new listings trigger notifications.
- Graceful shutdown on `SIGINT`/`SIGTERM`.

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
- `targets[]` — one entry per phone model to watch, each with `query`,
  `max_buy_price`, `market_value`, and optional `keywords_any` /
  `keywords_exclude`.
- `fees`, `min_expected_profit`, `poll_interval_seconds`, `prime_on_start`.

## Run

```bash
python main.py                # uses ./config.json
python main.py path/to.json   # custom config
```

## Test

```bash
python tests/test_e2e.py      # no network/secrets required
```
