"""GC Jobs (Public Service Commission of Canada): https://emploisfp-psjobs.cfp-psc.gc.ca/
psrs-srfp/applicant/page2440?... (search) or .../page1800?poster=<id> (one posting).

The search results are built in the visitor's server session and shown by JavaScript, and the
page links (requestedPage=<n>&fromPage=<n-1>) only work inside that session, so the search runs in
the browser pool. Posting pages work over plain HTTP once the session cookie is set (httpx
follows the jsessionid redirect), so details are read with the fetcher.

`locationsFilter=fredericton` in a pasted URL is only the text box used to look locations up;
the real filter is `location=W401`. We resolve the text through the site's own lookup.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import httpx
from selectolax.lexbor import LexborHTMLParser

from .. import platforms
from ..fetch import Blocked, Fetcher, NotFound
from ..strategies import json_ld
from . import MAX_POSTINGS, posting

log = logging.getLogger("ignite.gcjobs")

BASE = "https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant/"
SEARCH_FIELDS = ("title", "departments", "officialLanguage", "referenceNumber", "selectionProcessNumber")
RESULTS = "li.searchResult"
_XHR = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*; q=0.01"}


def posting_url(poster: str) -> str:
    return f"{BASE}page1800?poster={poster}"


def resolve_locations(text: str, fetch: Fetcher) -> list[tuple[str, str]]:
    """Location text -> [(code, description)], e.g. 'fredericton' -> [('W401', 'Fredericton (New Brunswick)')]."""
    response = fetch.request("GET", f"{BASE}page2440", params={"tab": "1", "ajaxFilter": text}, headers=_XHR)
    found = [(f"{loc['LOCATION_CD']}{loc['LOCATION_ID']}", loc["LOCATION_DESC"]) for loc in response.json()]
    exact = [f for f in found if f[1].lower().startswith(text.strip().lower())]
    return exact or found


def parse_results(html: str) -> tuple[list[dict], int]:
    """Result rows on one page, and how many pages the search has."""
    page = LexborHTMLParser(html)
    rows = []
    for item in page.css(RESULTS):
        link = item.css_first("a[href*='poster=']")
        if link is None:
            continue
        text = re.sub(r"\s+", " ", item.text()).strip()
        closing = re.search(r"Closing date:\s*(\d{4}-\d{2}-\d{2})", text)
        # First cell: "Closing date: ..." <br> organization <br> location
        cell = item.css_first("div.tableCell")
        lines = [
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", part)).strip()
            for part in re.split(r"<br\s*/?>", cell.inner_html if cell else "")
        ]
        lines = [line for line in lines if line and not line.startswith("Closing date")]
        rows.append({
            "poster": re.search(r"poster=(\d+)", link.attributes["href"]).group(1),
            "link": urljoin(BASE, link.attributes["href"]),
            "title": link.text(strip=True),
            "closes": closing.group(1) if closing else None,
            "organization": lines[0] if lines else None,
            "location": lines[1] if len(lines) > 1 else None,
        })
    pager = page.css_first("span.pagelinks")
    pages = re.search(r"of\s+(\d+)", pager.text()) if pager else None
    return rows, int(pages.group(1)) if pages else 1


def _field(page: LexborHTMLParser, label: str) -> str | None:
    for bold in page.css("main div.bottomSpace b, main div b"):
        if bold.text(strip=True) == label:
            value = bold.parent.text(strip=False).replace(bold.text(strip=False), "", 1)
            return re.sub(r"\s+", " ", value).strip() or None
    return None


def _closing(text: str | None) -> str | None:
    match = re.search(r"([A-Z][a-z]+ \d{1,2}, \d{4})", text or "")
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%B %d, %Y").date().isoformat()
    except ValueError:
        return None


def _with_searched(location: str | None, searched: str | None) -> str | None:
    # The search matched "Various locations" postings on the searched place: say so.
    if searched and location and location.strip().lower() == "various locations":
        return f"{location}, including {searched}"
    return location


def _external(url: str, fetch: Fetcher) -> list[dict]:
    """Read a posting the hiring organization hosts itself: platform API or JSON-LD."""
    platform = platforms.detect(url)
    if platform.adapter and platform.pool == "http":
        from . import get  # late import: this module is loaded through the same registry

        return get(platform.adapter)(url, fetch)
    if not platform.scrapable or platform.pool != "http":
        return []
    final_url, html = fetch.html(url)
    return [json_ld.to_posting(n, final_url) for n in json_ld.job_postings(html, final_url)]


def external_posting(poster: str, link: str, fetch: Fetcher, row: dict, searched: str | None) -> dict:
    """GC Jobs only shows an exit notice: the posting lives on the employer's own site."""
    try:
        found = _external(link, fetch)
    except (NotFound, Blocked, httpx.HTTPError, ValueError, KeyError) as exc:
        log.info("poster %s: could not read %s (%s)", poster, link, exc)
        found = []
    raw = {"poster": poster, "external_url": link, "organization": row.get("organization")}
    if found:
        p = found[0]
        p["organization"] = p.get("organization") or (row.get("organization") or "").split(" - ")[0] or None
        # GC Jobs matched it on the searched place; the employer's own city list may not say so.
        if (row.get("location") or "").strip().lower() == "various locations" and searched:
            p["location_text"] = _with_searched(row.get("location"), searched)
        else:
            p["location_text"] = p.get("location_text") or row.get("location")
        p["closes_at"] = p.get("closes_at") or row.get("closes")
        p["raw"] = {**raw, "external": p.get("raw")}
        return p
    return posting(
        title=row.get("title"),
        url=link,
        organization=(row.get("organization") or "").split(" - ")[0] or None,
        location_text=_with_searched(row.get("location"), searched),
        closes_at=row.get("closes"),
        raw=raw,
    )


def detail(poster: str, fetch: Fetcher, row: dict | None = None, searched: str | None = None) -> dict:
    link = (row or {}).get("link")
    if link and "/page1800" not in link:
        # Another part of the site, e.g. the student recruitment programme (/srs-sre/...).
        return external_posting(poster, link, fetch, row or {}, searched)
    url = posting_url(poster)
    _, html = fetch.html(url)
    page = LexborHTMLParser(html)
    h1 = page.css_first("main h1")
    if h1 is None:
        raise NotFound(f"GC Jobs poster {poster} is not available")
    if "leave the GC Jobs" in h1.text() or "quitter le site" in h1.text():
        link = next(
            (a.attributes["href"] for a in page.css("main a[href^='http']")
             if "cfp-psc.gc.ca" not in a.attributes["href"]),
            None,
        )
        if link:
            return external_posting(poster, link, fetch, row or {}, searched)
    row = row or {}
    org_line = page.css_first("main h2.pst-h2")
    # Older posters have no organization heading or labelled fields: use the search row.
    org_full = re.sub(r"\s+", " ", org_line.text()).strip() if org_line else row.get("organization")
    location = _with_searched(_field(page, "Location") or row.get("location"), searched)
    body = page.css_first("main div.templates-container")
    if body is None:  # older layout: the whole main column is the posting
        body = page.css_first("main")
        for node in body.css("h1, .rightRefNumberWithPadding, #wb-dtmd, nav"):
            node.decompose()
    if body is not None:
        for node in body.css("form, button, input, .btn"):
            node.decompose()
    closing_heading = page.css_first("main h3.pst-h3")
    return posting(
        title=re.sub(r"\s+", " ", h1.text()).strip(),
        url=url,
        # "Transport Canada - Transport Canada – Marine Safety and Security": department first.
        organization=org_full.split(" - ")[0] if org_full else None,
        location_text=location,
        description=body.inner_html if body is not None else None,
        closes_at=row.get("closes") or _closing(closing_heading.text() if closing_heading else None),
        language=(page.css_first("html").attributes.get("lang") or "")[:2] or None,
        raw={
            "poster": poster,
            "organization": org_full,
            "reference_number": _field(page, "Reference number"),
            "selection_process_number": _field(page, "Selection process number"),
            "salary": _field(page, "Salary"),
            "level": _field(page, "Level"),
            "who_can_apply": _field(page, "Who can apply"),
        },
    )


def scrape(url: str, fetch: Fetcher, browser=None) -> list[dict]:
    query = parse_qs(urlparse(url).query)
    if poster := (query.get("poster") or [None])[0]:
        return [detail(poster, fetch)]
    if browser is None:
        raise ValueError("a GC Jobs search needs the browser pool")

    locations = query.get("location") or []
    searched = None
    if not locations and (text := (query.get("locationsFilter") or [""])[0].strip()):
        resolved = resolve_locations(text, fetch)
        if not resolved:
            raise NotFound(f"GC Jobs has no location matching {text!r}")
        locations = [code for code, _ in resolved]
        searched = ", ".join(desc for _, desc in resolved)

    params: list[tuple[str, str]] = [("tab", query.get("tab", ["1"])[0])]
    params += [(f, query.get(f, [""])[0]) for f in SEARCH_FIELDS]
    params += [("location", code) for code in locations]
    params += [("search", "Search jobs"), ("log", "false")]

    rows: list[dict] = []
    seen: set[str] = set()
    page_url = f"{BASE}page2440?{urlencode(params)}"
    number = 1
    while True:
        _, html = browser.html(page_url, wait_for=RESULTS)
        page_rows, pages = parse_results(html)
        fresh = [r for r in page_rows if r["poster"] not in seen]
        seen.update(r["poster"] for r in fresh)
        rows += fresh
        if not fresh or number >= pages or len(rows) >= MAX_POSTINGS:
            break
        number += 1
        page_url = f"{BASE}page2440?requestedPage={number}&fromPage={number - 1}&tab=1&log=false"

    postings = []
    for row in rows[:MAX_POSTINGS]:
        try:
            postings.append(detail(row["poster"], fetch, row, searched))
        except (NotFound, httpx.HTTPError) as exc:  # one withdrawn poster must not sink the search
            log.info("skipping poster %s: %s", row["poster"], exc)
    return postings
