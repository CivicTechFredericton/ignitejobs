"""The strategy chain for one URL, independent of the queue so it can run from the CLI.

1. Platform API adapter, when the platform has one.
2. JSON-LD JobPosting data in the page (plain HTTP in the http pool, rendered DOM in the
   browser pool).
3. For careers pages: follow links that look like postings and read their JSON-LD.
4. http pool: nothing found or the site refused us -> Escalate to the browser pool.
   browser pool: nothing found -> NoPostings (a moderator enters it by hand).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, Protocol

import httpx

from . import adapters, platforms
from .fetch import Blocked, Fetcher, NotFound
from .strategies import discovery, json_ld

log = logging.getLogger("ignite.pipeline")


class Escalate(Exception):
    """Plain HTTP was not enough; retry in the browser pool."""


class NoPostings(Exception):
    """Every strategy ran and found no posting."""


class ManualOnly(Exception):
    """This URL must not be scraped; a moderator enters it by hand."""


class PageSource(Protocol):
    def html(self, url: str, wait_for: str | None = None) -> tuple[str, str]: ...


def _from_pages(url: str, kind: str, pages: PageSource) -> list[dict[str, Any]]:
    final_url, html = pages.html(url)
    found = [json_ld.to_posting(n, final_url) for n in json_ld.job_postings(html, final_url)]
    if found or kind != "careers_page":
        return found
    links = discovery.job_links(html, final_url)
    log.info("%s: no JSON-LD, following %d posting links", url, len(links))
    for link in links:
        try:
            link_url, link_html = pages.html(link)
        except (NotFound, httpx.HTTPError) as exc:
            log.info("skipping %s: %s", link, exc)
            continue
        found += [json_ld.to_posting(n, link_url) for n in json_ld.job_postings(link_html, link_url)]
    return found


def scrape(
    url: str,
    kind: str,
    pool: str,
    fetcher: Fetcher,
    browser_factory: Callable[[], PageSource] | None = None,
) -> tuple[platforms.Platform, str, list[dict[str, Any]]]:
    """Return (platform, strategy used, postings) or raise one of the exceptions above,
    fetch.Blocked or fetch.NotFound."""
    platform = platforms.detect(url)
    if not platform.scrapable:
        raise ManualOnly(f"{platform.name} is manual-entry only")
    if platform.name == "indeed" and not platforms.is_indeed_posting(url):
        raise ManualOnly("Indeed: only single postings (viewjob?jk=...) are scraped")
    url = platforms.canonical_url(url)

    if platform.adapter and platform.pool == "browser":
        # Adapters for sites that only work in a real browser (session + JavaScript searches).
        if pool != "browser" or browser_factory is None:
            raise Escalate(f"{platform.name} needs a browser")
        return platform, "headless", adapters.get(platform.adapter)(url, fetcher, browser_factory())
    if platform.adapter:
        return platform, "platform_api", adapters.get(platform.adapter)(url, fetcher)

    if pool == "http" and platform.pool == "http":
        try:
            found = _from_pages(url, kind, fetcher)
        except Blocked as exc:
            raise Escalate(str(exc)) from exc
        if found:
            return platform, "json_ld", found
        raise Escalate("no postings found over plain HTTP")

    if browser_factory is None:
        raise Escalate(f"{platform.name} needs a browser")
    found = _from_pages(url, kind, browser_factory())
    if not found:
        raise NoPostings("no job postings found on the page; add it by hand")
    return platform, "headless", found
