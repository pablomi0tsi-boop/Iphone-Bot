# AGENTS.md

## Cursor Cloud specific instructions

Python `asyncio` OLX iPhone resale-deal monitor. Single service, CLI/headless
(no GUI). Flow: poll OLX per `search_queries` → drop promoted → blacklist/
accessory keyword filter → detect model+storage (`pricing.py`) → look up
`resale_prices` → notify for **every** recognized listing, showing
`profit_or_loss = resale − listing_price` (can be negative). There is
deliberately **no minimum-profit threshold** — do not reintroduce one without
an explicit user request; it was removed on purpose (see below).

### Environment
- Python 3.12. Dependencies live in `requirements.txt` (`aiohttp`, `aiosqlite`,
  plus FastAPI/SQLAlchemy/psycopg2 for the web API).
- Use the project virtualenv: `source .venv/bin/activate` before running
  anything. The update script creates `.venv` and installs deps.
- `python3 -m venv` needs the OS package `python3.12-venv` (already handled in
  the update script). It is a system package, not a pip dependency.

### Run
- **Bot (unchanged):** `python main.py` (uses `config.json`) or
  `python main.py <path>`. Still uses SQLite (`database.py` / `listings.db`)
  for de-dup — do not replace that with Postgres yet.
- With `discord.webhook_url` empty the app runs in **dry-run** mode: matching
  deals are logged, not POSTed. This is the safe way to run without secrets.
- Live OLX (`https://www.olx.pl/api/v1/offers/`) is reachable from the VM and
  returns real data; a browser-like `User-Agent` is required (already set).
- Stop with Ctrl-C — shutdown is graceful and finishes the current cycle.
- **Web API (scaffold):** code lives under `api/` (`app.py`, `database.py`,
  `models.py`, `schemas.py`). It is a separate FastAPI service on PostgreSQL
  (`DATABASE_URL`, default in `api/database.py`). Start with
  `uvicorn api.app:app --reload --host 0.0.0.0 --port 8000` from the repo root.
  Exposes `GET /offers` and `GET /health`. Does not run or modify the bot.

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

### Diagnosing "listings checked: 0" after startup
If `STATS` keeps showing `listings checked: 0` (and no `[query] fetched N
offer(s)...` lines appear at all), the fetch is failing before it ever reaches
`DealMonitor._process_listings` — check for `[query] poll failed (attempt N):
...` WARNING lines (network/HTTP error, backing off) first. `olx.py` and
`main.py` log every stage at INFO by default (no config needed):
- `olx: [query] OLX request: GET <full URL incl. query string> -> HTTP <code>`
- `olx: [query] OLX page offset=N: X offer(s) in response, Y flagged promoted`
- `olx: [query] OLX search summary: X raw, Y promoted skipped, Z parse
  error(s), W organic listing(s) returned`
- `phonedealbot: [query] fetched N offer(s), M already seen (deduped), K new`
  (logged even when `K == 0`, so silence here — not just a 0 stat — means the
  loop for that query isn't running at all, e.g. crashed on startup).
Per-listing rejection reasons from `DealMonitor.evaluate` are logged at DEBUG
(`[reject] id=... -> <reason>`); raise the `phonedealbot` logger to DEBUG to
see them (`logging.getLogger("phonedealbot").setLevel(logging.DEBUG)`).
`listings_checked` only increments for offers that are BOTH fetched from OLX
AND not already in `seen_listings` — so it can legitimately stay near-flat for
a while on a normal, working bot if nothing new has appeared yet (OLX's
top-40 for a query is often near-static minute to minute); it should never
stay at exactly 0 while `fetched N offer(s)...` lines show `N > 0` and
`already seen (deduped)` is less than `N`.

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
  `filter_float_price:asc|desc` actually sorts server-side. New-listing
  *detection* MUST still rely on DB de-dup, not on API order. Do not
  reintroduce a `sort_by=created_at` request-param assumption — it's a no-op.
  **Processing/delivery order is handled client-side instead**:
  `OlxClient.search()` sorts every fetched page by `listing_sort_key()`
  (`Listing.created_at`, i.e. OLX `created_time` → `last_refresh_time`
  fallback) before returning, and `DealMonitor._process_listings` /
  the deal-delivery sort in `main.py` both preserve/re-apply that same
  newest-first order — so the monitor always processes and notifies the
  newest listing in a poll first, regardless of raw API ordering. Verify at
  runtime via the `"sorted N listing(s) newest-first by 'created_at'"` (olx)
  and `"processing order (newest-first, by 'created_at')"` (main) log lines.
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
  (`Listing.is_business is True`), unconfident model/storage, and no configured
  `resale_prices` entry. Promoted ads are dropped in `OlxClient.search`.
  **There is no profit-based filter** — every listing that survives the above
  notifies, whether `profit_or_loss = resale − price` is positive or negative.
  `discord.py`'s `💰 Zysk/Strata` field always shows the sign explicitly
  (`+X zł` / `-X zł`); `Stats.average_profit` can legitimately be negative.
- Swap listings report `price = 0` (and usually a swap keyword), so they are
  filtered by BOTH the zero-price rule and the swap blacklist words.
- **Keyword matching (`DealMonitor.has_filtered_keyword`) is asymmetric on
  purpose** — this was the root cause of a real bug where ~70% of live
  listings were silently rejected:
  - `accessory_keywords` (`etui`, `bateria`, `ekran`, `kabel`, ...) are
    matched against the **title only**. Matching them in the description too
    rejects nearly every genuine phone listing, since sellers routinely write
    "bateria 89%", "dorzucam etui", "kabel w zestawie" as normal disclosures
    on a real phone sale, not an accessory-only ad. Genuine accessory-only
    ads reliably name the accessory in the title, so title-only matching is
    both safe and effective.
  - `blacklist_keywords` are still matched against title + description
    (they describe a real disqualifying problem that may only be mentioned
    in the description), via `_compile_keyword_patterns` regexes with a
    negative look-behind so a keyword doesn't false-match inside a
    negated/prefixed word (`"uszkodzony"` inside `"nieuszkodzony"`,
    `"locked"` inside `"unlocked"`) while still matching Polish suffix
    inflections (`"ekran"` → `"ekranu"`).
  - If you add new keywords, verify empirically (fetch a live OLX page and
    run it through `DealMonitor.evaluate`/`has_filtered_keyword`) before
    assuming they only match the intended listings — common Polish words
    (`bateria`, `ekran`, `części`) are extremely easy to over-match.
- Stats (`Stats` + `_stats_loop`) log every `stats_interval_seconds` (default
  600s) and once on shutdown.
- Detection latency floor = poll interval + request (~0.4-0.5s) + OLX search
  index lag (server-side, uncontrollable). "Within seconds" is best-effort, not
  guaranteed.
