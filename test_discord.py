#!/usr/bin/env python3
"""Send a one-shot Discord webhook test message using config.json."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import aiohttp

MESSAGE = (
    "✅ Test message from Phone Deal Bot. If you can see this, the webhook works."
)
CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


async def main() -> int:
    with CONFIG_PATH.open(encoding="utf-8") as fh:
        config = json.load(fh)

    webhook_url = config["discord"]["webhook_url"]
    payload = {"content": MESSAGE}

    async with aiohttp.ClientSession() as session:
        async with session.post(webhook_url, json=payload) as response:
            body = await response.text()
            if response.status == 204:
                print("Success")
                return 0
            print(body)
            return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
