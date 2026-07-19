# AGENTS.md

## Cursor Cloud specific instructions

Python `asyncio` OLX iPhone resale-deal monitor. Single service, CLI/headless
(no GUI). Flow: poll OLX per `search_queries` → drop promoted → blacklist filter
→ detect model+storage (`pricing.py`) → look up `resale_prices` → notify when
`profit = resale − listing_price > min_profit` (default 1).

### Environment
- Python 3.12. Dependencies live in `requirements.txt` (`aiohttp`, `aiosqlite`).
- Use the project virtualenv: `source .venv/bin/activate` before running
  anything. The update script creates `.venv` and installs deps.
- `python3 -m venv` needs the OS package `python3.12-venv` (already handled in
  the update script). It is a system package, not a pip dependency.

### Run
- `python main.py` (uses `config.json`) or `python main.py <path>`.
- With `discord.webhook_url` empty the app runs in **dry-run** mode: matching
  deals are logged, not POSTed. This is the safe way to run without secrets.
- Live OLX (`https://www.olx.pl/api/v1/offers/`) is reachable from the VM and
  returns real data; a browser-like `User-Agent` is required (already set).
- Stop with Ctrl-C — shutdown is graceful and finishes the current cycle.

### Test / verify
- Units: `python tests/test_pricing.py` (model/storage parser + `PriceBook`).
- End-to-end: `python tests/test_e2e.py`. It starts a local aiohttp server that
  fakes BOTH the OLX API and the Discord webhook, so it needs no network or
  secrets and is the fastest way to validate the full pipeline.
- Stability: `python tests/test_stability.py` (DB auto-create/corruption
  recovery, config validation, empty-webhook dry-run, Discord timeout retry).
- There is no separate lint config; `python -m py_compile *.py` is a quick
  syntax check.

### Resilience behaviours (don't "simplify" these away)
- `ListingDatabase.connect` creates parent dirs and, if the DB file is corrupt,
  quarantines it to `*.corrupt-<ts>` and recreates a fresh one (self-heal).
- `load_config` validates numeric fields (raises `ValueError` with the field
  name) and reports invalid JSON clearly; `main()` exits cleanly on config
  errors.
- Discord `_post` retries on both `aiohttp.ClientError` and
  `asyncio.TimeoutError`; OLX poll failures back off exponentially per query.
- Shutdown drains the notification queue with a 15s cap so a slow Discord can't
  hang exit; all background tasks are cancelled and the aiohttp session closes
  via `async with`.

### Gotchas
- `discord.py` here is a **local module** (webhook sender), not the third-party
  `discord.py` package. Do not `pip install discord.py`; it would shadow this
  module. Notifications use plain `aiohttp` POSTs.
- SQLite (`listings.db` by default) is the de-dup store. Deleting it makes every
  current listing look "new" again. Priming now only runs on a **fresh/empty**
  DB, so with an existing DB a restart notifies for listings new since last run.
- `*.db` files and `.venv/` are git-ignored; don't commit them.

### OLX API behaviour (verified, non-obvious — don't "fix" as bugs)
- The OLX `/api/v1/offers/` endpoint is **unofficial** (no official/public or
  push API exists) and needs a browser-like `User-Agent`.
- **`sort_by=created_at:*` is silently ignored** by the API (asc and desc return
  identical, non-chronological results, sometimes oldest-first). Only
  `filter_float_price:asc|desc` actually sorts. So there is NO reliable
  newest-first order — detection MUST rely on DB de-dup, not ordering. Do not
  reintroduce a `created_at` sort assumption.
- Each page injects paid **promoted ads**; their indices are in
  `metadata.promoted`. `olx.py` drops them by default (`include_promoted:false`).
- OLX phone listings expose structured attributes `phonemodel` and
  `builtinmemory_phones` (storage) in `params`, plus a full HTML `description`.
  `pricing.py` prefers these structured hints, then parses title/description.
- Storage/model detection is deliberately conservative: text capacities need an
  explicit GB/TB unit and must be unambiguous, else the listing is ignored.
- `resale_prices` in `config.json` are the user's real PLN values. Prices drive
  buy decisions, so never invent them.
- Deal filtering (in `DealMonitor.evaluate`) ignores: blacklist + accessory
  keyword hits, `price <= 0`, no photos, business-account sellers
  (`Listing.is_business is True`), unconfident model/storage, and
  `profit < minimum_profit` (default 300, `>=` to notify). Promoted ads are
  dropped in `OlxClient.search`.
- Swap listings report `price = 0` (and usually a swap keyword), so they are
  filtered by BOTH the zero-price rule and the swap blacklist words.
- Some `accessory_keywords` (`bateria`, `ekran`, `wyświetlacz`, `szkło`, ...)
  also occur in genuine phone listings, so they lower recall (~30% in live
  sampling). This is intentional per spec and tunable in `config.json`; do not
  silently remove them.
- Stats (`Stats` + `_stats_loop`) log every `stats_interval_seconds` (default
  600s) and once on shutdown.
- Detection latency floor = poll interval + request (~0.4-0.5s) + OLX search
  index lag (server-side, uncontrollable). "Within seconds" is best-effort, not
  guaranteed.
