"""UKG Pro Recruiting (UltiPro): https://recruiting.ultipro.ca/<tenant>/JobBoard/<board id>/
[OpportunityDetail?opportunityId=<id>]. The job board is a JS app over a JSON search endpoint
(JobBoardView/LoadSearchResults); each posting's page embeds its full details as JSON.

A board URL's query string is the board's own search: `q` (search text) and `o` (sort order) are
passed through, so a moderator can paste e.g. a "fredericton" search and get just those jobs.
The sort order matters: a text search sorted by relevance matches more postings than the same
search sorted by date, so we sort the way the board does."""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import parse_qs, urlparse

from ..fetch import Fetcher, NotFound
from . import MAX_POSTINGS, join, posting

log = logging.getLogger("ignite.ultipro")

_PATH = re.compile(r"^/(?P<tenant>[^/]+)/JobBoard/(?P<board>[0-9a-fA-F-]{36})(?P<detail>/OpportunityDetail)?")
PAGE_SIZE = 50

# The board's sort options (US.Opportunity.OpportunitiesViewModel, Nov 2026), keyed by `o`.
ORDER_BY = {
    "relevance": {"Value": "relevance", "PropertyName": "MatchScore", "Ascending": False},
    "bestMatchDesc": {"Value": "bestMatchDesc", "PropertyName": "MatchScore", "Ascending": False},
    "postedDateDesc": {"Value": "postedDateDesc", "PropertyName": "PostedDate", "Ascending": False},
    "postedDateAsc": {"Value": "postedDateAsc", "PropertyName": "PostedDate", "Ascending": True},
}
_KNOWN_PARAMS = {"q", "o"}


def parse(url: str) -> tuple[str, str | None, dict[str, str]]:
    """Return (board base URL, opportunity id or None, search params q/o)."""
    parsed = urlparse(url)
    match = _PATH.match(parsed.path)
    if not match:
        raise ValueError(f"not an UltiPro job board URL: {url}")
    board = f"https://{parsed.hostname}/{match['tenant']}/JobBoard/{match['board']}"
    query = {k: v[0] for k, v in parse_qs(parsed.query).items() if v and v[0]}
    opportunity = query.get("opportunityId") if match["detail"] else None
    if match["detail"] and not opportunity:
        raise ValueError(f"UltiPro posting URL without an opportunityId: {url}")
    return board, opportunity, {k: v for k, v in query.items() if k in _KNOWN_PARAMS}


def _embedded(html: str, marker: str) -> object | None:
    """The JSON value that follows `marker` in a page's inline script, or None."""
    start = html.find(marker)
    if start < 0:
        return None
    value, _ = json.JSONDecoder().raw_decode(html[start + len(marker):].lstrip())
    return value


def organization(board: str, fetch: Fetcher) -> str | None:
    """The employer, from the board's name ("Steele Auto Group Careers" -> "Steele Auto Group")."""
    try:
        _, html = fetch.html(f"{board}/")
    except NotFound:
        return None
    info = _embedded(html, "jobBoard:")
    name = (info or {}).get("Name") if isinstance(info, dict) else None
    if not name:
        return None
    return re.sub(r"\s*[-–|:]?\s*(careers?|jobs?|job board|opportunities)\s*$", "", name, flags=re.IGNORECASE) or name


def _location(locations: list[dict]) -> str:
    places = []
    for loc in locations or []:
        address = loc.get("Address") or {}
        places.append(join(address.get("City"), (address.get("State") or {}).get("Name")) or loc.get("LocalizedName"))
    return join(*places, sep="; ")


def detail(board: str, opportunity_id: str, org: str | None, fetch: Fetcher) -> dict:
    url = f"{board}/OpportunityDetail?opportunityId={opportunity_id}"
    _, html = fetch.html(url)
    # An unknown or withdrawn opportunity still answers 200, with no opportunity on the page.
    job = _embedded(html, "new US.Opportunity.CandidateOpportunityDetail(")
    if not isinstance(job, dict) or not job.get("Id"):
        raise NotFound(f"UltiPro no longer lists opportunity {opportunity_id}")
    if job.get("OpportunityIsClosed"):
        raise NotFound(f"UltiPro opportunity {opportunity_id} is closed")
    return posting(
        title=job.get("Title"),
        url=url,
        organization=org,
        location_text=_location(job.get("Locations") or []),
        description=job.get("Description"),
        posted_at=job.get("PostedDate"),
        raw={k: v for k, v in job.items() if k != "Description"},
    )


def search(board: str, params: dict[str, str], fetch: Fetcher) -> list[str]:
    text = params.get("q", "")
    # Without `o` the board sorts a text search by relevance and everything else by date.
    order = ORDER_BY.get(params.get("o", ""), ORDER_BY["relevance" if text else "postedDateDesc"])
    ids: list[str] = []
    while len(ids) < MAX_POSTINGS:
        page = fetch.post_json(
            f"{board}/JobBoardView/LoadSearchResults",
            {"opportunitySearch": {
                "Top": PAGE_SIZE, "Skip": len(ids), "QueryString": text, "OrderBy": [order], "Filters": [],
            }},
        )
        batch = [o["Id"] for o in page.get("opportunities") or []]
        ids += batch
        if not batch or len(ids) >= page.get("totalCount", 0):
            break
    return ids[:MAX_POSTINGS]


def scrape(url: str, fetch: Fetcher) -> list[dict]:
    board, opportunity_id, params = parse(url)
    extra = sorted(set(parse_qs(urlparse(url).query)) - _KNOWN_PARAMS - {"opportunityId"})
    if extra:
        # e.g. a map search (w=) or board filters: not applied, so this may return more postings.
        log.warning("%s: ignoring UltiPro search parameters %s", url, ", ".join(extra))
    if opportunity_id:
        return [detail(board, opportunity_id, organization(board, fetch), fetch)]
    ids = search(board, params, fetch)
    org = organization(board, fetch) if ids else None
    return [detail(board, i, org, fetch) for i in ids]
