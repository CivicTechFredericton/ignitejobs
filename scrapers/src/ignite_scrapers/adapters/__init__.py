"""Platform API adapters.

Each adapter module exposes `scrape(url, fetch) -> list[posting]`. It works out from the URL
whether it points at one posting or a whole careers page, and returns postings shaped like the
columns of the `postings` table (see `posting()` below). Raises fetch.NotFound when a single
posting is gone.
"""

from __future__ import annotations

import html
import importlib
import os
from collections.abc import Callable
from typing import Any

from ..fetch import Fetcher

Scrape = Callable[[str, Fetcher], list[dict[str, Any]]]

# A careers page can list hundreds of openings; each one costs a request for its details.
MAX_POSTINGS = int(os.environ.get("SCRAPER_MAX_POSTINGS", "60"))


def get(name: str) -> Scrape:
    return importlib.import_module(f"{__name__}.{name}").scrape


def posting(
    *,
    title: str | None,
    url: str,
    raw: Any,
    organization: str | None = None,
    location_text: str | None = None,
    description: str | None = None,
    posted_at: str | None = None,
    closes_at: str | None = None,
    language: str | None = None,
) -> dict[str, Any]:
    return {
        "title": html.unescape(title).strip() if title else None,
        "url": url,
        "raw": raw,
        "organization": organization or None,
        "location_text": location_text or None,
        "description": description or None,
        "posted_at": posted_at or None,
        "closes_at": closes_at or None,
        "language": language or None,
    }


def join(*parts: str | None, sep: str = ", ") -> str:
    return sep.join(dict.fromkeys(p.strip() for p in parts if p and p.strip()))
