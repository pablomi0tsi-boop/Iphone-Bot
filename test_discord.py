#!/usr/bin/env python3
"""Send a one-shot Discord webhook test message using config.json."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import aiohttp

MESSAGE = "✅ Phone Deal Bot test - Discord webhook is working."
CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


async def main() -> int:
    with CONFIG_PATH.open(encoding="utf-8") as fh:
        config = json.load(fh)

    webhook_url = (config.get("discord") or {}).get("webhook_url", "").strip()
    if not webhook_url:
        print("No discord.webhook_url configured in config.json", file=sys.stderr)
        return 1

    username = (config.get("discord") or {}).get("username", "Phone Deal Bot")
    payload = {"content": MESSAGE, "username": username}

    async with aiohttp.ClientSession() as session:
        async with session.post(webhook_url, json=payload) as response:
            if response.status >= 400:
                body = await response.text()
                print(
                    f"Discord webhook failed: HTTP {response.status}: {body}",
                    file=sys.stderr,
                )
                return 1

    print("Sent Discord webhook test message.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
