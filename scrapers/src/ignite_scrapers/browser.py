"""Headless Chromium (Playwright) for sites that render postings with JavaScript or refuse plain
HTTP clients. We do not solve CAPTCHAs or evade bot checks: a challenge page means Blocked."""

from __future__ import annotations

import logging
import re

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

from .fetch import USER_AGENT, Blocked, Pacer, check_status

log = logging.getLogger("ignite.browser")

_CHALLENGE_TITLE = re.compile(
    r"just a moment|attention required|verify you are human|access denied|security check|"
    r"are you a robot|blocked",
    re.IGNORECASE,
)
# Interstitial challenges only. Invisible reCAPTCHA on an apply form is not a challenge.
_CHALLENGE_FRAME = 'iframe[src*="challenges.cloudflare.com"], #px-captcha, #challenge-form'


class Browser:
    def __init__(self, pacer: Pacer | None = None) -> None:
        self.pacer = pacer or Pacer()
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)
        # Same desktop-Chrome user agent as the HTTP worker (SCRAPER_USER_AGENT overrides it).
        self._context = self._browser.new_context(
            user_agent=USER_AGENT, locale="en-CA", viewport={"width": 1280, "height": 900}
        )
        # Postings are text: skip images, fonts and media to be lighter on the sites we visit.
        self._context.route(
            re.compile(r"\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp4|webm)(\?.*)?$"),
            lambda route: route.abort(),
        )

    def html(self, url: str, wait_for: str | None = None) -> tuple[str, str]:
        """Render the page and return (final URL, rendered HTML). `wait_for` is a CSS selector
        for content that scripts add after load (e.g. search results)."""
        self.pacer.wait(url)
        page = self._context.new_page()
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            if response is not None:
                check_status(response.status, url)
            try:
                page.wait_for_load_state("networkidle", timeout=10_000)
            except PlaywrightTimeout:
                pass  # chatty pages never go idle; what has rendered by now is enough
            if wait_for:
                try:
                    page.wait_for_selector(wait_for, state="attached", timeout=20_000)
                except PlaywrightTimeout:
                    pass  # e.g. a search with no results; the caller reads what is there
            if _CHALLENGE_TITLE.search(page.title()) or page.query_selector(_CHALLENGE_FRAME):
                raise Blocked(f"bot challenge on {url}")
            if response is not None and response.status >= 400:
                raise PlaywrightError(f"HTTP {response.status} from {url}")
            return page.url, page.content()
        finally:
            page.close()

    def close(self) -> None:
        self._context.close()
        self._browser.close()
        self._playwright.stop()
