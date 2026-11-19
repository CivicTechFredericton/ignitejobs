"""HTTP fetching shared by every strategy: one client, per-host pacing, typed failures."""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from .platforms import host_of

USER_AGENT = os.environ.get("SCRAPER_USER_AGENT") or (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

# Headers a desktop Chrome sends on a top-level navigation.
BROWSER_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
    "image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

# Minimum seconds between two requests to the same host. Job boards get a slower pace.
DEFAULT_INTERVAL = float(os.environ.get("SCRAPER_MIN_INTERVAL", "1.0"))
HOST_INTERVALS = {
    "indeed.com": 20.0,
    "careerbeacon.com": 3.0,
}


class Blocked(Exception):
    """The site refused us (challenge page, 401/403/429). Stop and leave it to a moderator."""


class NotFound(Exception):
    """The page is gone (404/410): the posting was taken down or the URL is wrong."""


class Pacer:
    """Waits so that requests to one host are at least `interval` seconds apart."""

    def __init__(self) -> None:
        self._last: dict[str, float] = {}

    def wait(self, url: str) -> None:
        host = host_of(url)
        interval = next(
            (v for k, v in HOST_INTERVALS.items() if host == k or host.endswith("." + k)),
            DEFAULT_INTERVAL,
        )
        delay = self._last.get(host, 0.0) + interval - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        self._last[host] = time.monotonic()


def check_status(status: int, url: str) -> None:
    if status in (401, 403, 429):
        raise Blocked(f"HTTP {status} from {url}")
    if status in (404, 410):
        raise NotFound(f"HTTP {status} from {url}")


class Fetcher:
    def __init__(self, client: httpx.Client | None = None, pacer: Pacer | None = None) -> None:
        self.client = client or httpx.Client(
            headers=BROWSER_HEADERS, follow_redirects=True, timeout=30.0
        )
        self.pacer = pacer or Pacer()

    def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        self.pacer.wait(url)
        response = self.client.request(method, url, **kwargs)
        check_status(response.status_code, url)
        response.raise_for_status()
        return response

    def html(self, url: str) -> tuple[str, str]:
        """Return (final URL after redirects, page HTML)."""
        response = self.request("GET", url)
        return str(response.url), response.text

    def json(self, url: str, **kwargs: Any) -> Any:
        return self.request("GET", url, headers={"Accept": "application/json"}, **kwargs).json()

    def post_json(self, url: str, body: Any) -> Any:
        return self.request("POST", url, json=body, headers={"Accept": "application/json"}).json()

    def close(self) -> None:
        self.client.close()
