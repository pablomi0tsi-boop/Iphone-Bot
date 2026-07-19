# AGENTS.md

## Cursor Cloud specific instructions

Python `asyncio` OLX phone-deal monitor. Single service, CLI/headless (no GUI).

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
- End-to-end: `python tests/test_e2e.py`. It starts a local aiohttp server that
  fakes BOTH the OLX API and the Discord webhook, so it needs no network or
  secrets and is the fastest way to validate the full pipeline.
- There is no separate lint config; `python -m py_compile main.py olx.py
  database.py discord.py` is a quick syntax check.

### Gotchas
- `discord.py` here is a **local module** (webhook sender), not the third-party
  `discord.py` package. Do not `pip install discord.py`; it would shadow this
  module. Notifications use plain `aiohttp` POSTs.
- SQLite (`listings.db` by default) is the de-dup store. Deleting it makes every
  current listing look "new" again; combined with `prime_on_start: false` that
  causes a burst of notifications on the next run. Keep `prime_on_start: true`
  in production so the back-catalogue is recorded silently on first cycle.
- `*.db` files and `.venv/` are git-ignored; don't commit them.
