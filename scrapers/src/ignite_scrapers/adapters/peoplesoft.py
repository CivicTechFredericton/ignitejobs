"""Oracle PeopleSoft Candidate Gateway (fluid), e.g. NB Power:
https://<host>/psc/<site>/EMPLOYEE/HRMS/c/HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL?...&SiteId=2

There is no JSON API. The job search is a server-rendered form: we open a guest session
(SiteId=<n> signs in as the public guest), replay the "View All Jobs" form postback, read the
result rows, then open each posting by its direct link (JobOpeningId), which also works for
visitors with no session, so it is safe to publish.

Without SiteId PeopleSoft answers with a "cookies required" sign-in page; when the URL has no
SiteId we try the first few site numbers and keep the first one that offers a public search.
"""

from __future__ import annotations

from datetime import datetime
from urllib.parse import parse_qs, urlencode, urlparse

from selectolax.lexbor import LexborHTMLParser

from ..fetch import Fetcher, NotFound
from . import MAX_POSTINGS, posting

_SITE_IDS_TO_TRY = ("2", "1", "3")
VIEW_ALL_ACTION = "NAV_PB$0"


class NotAGuestSite(Exception):
    """The site number does not open a public job search."""


def _base(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def _query(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


def posting_url(base: str, site_id: str, job_id: str, seq: str = "1") -> str:
    query = {
        "Page": "HRS_APP_JBPST_FL",
        "Action": "U",
        "FOCUS": "Applicant",
        "SiteId": site_id,
        "JobOpeningId": job_id,
        "PostingSeq": seq,
    }
    return f"{base}?{urlencode(query)}"


def _home(base: str, site_id: str, fetch: Fetcher) -> LexborHTMLParser:
    query = {"FOCUS": "Applicant", "Page": "HRS_APP_SCHJOB", "Action": "U", "SiteId": site_id}
    _, html = fetch.html(f"{base}?{urlencode(query)}")
    page = LexborHTMLParser(html)
    if page.css_first("form[name=win0]") is None or "View All Jobs" not in html:
        raise NotAGuestSite(site_id)
    return page


def _text(node, selector: str) -> str | None:
    found = node.css_first(selector)
    text = found.text(strip=True) if found else ""
    return text or None


def _date(value: str | None) -> str | None:
    """PeopleSoft shows dates as 2026/11/30 (format follows the site's locale settings)."""
    if not value:
        return None
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _id(field: str) -> str:
    """CSS selector for a PeopleSoft element id (they contain '$')."""
    return f'[id="{field}"]'


def list_jobs(base: str, home: LexborHTMLParser, fetch: Fetcher) -> list[dict[str, str | None]]:
    """Replay the "View All Jobs" postback and read the result rows."""
    form = home.css_first("form[name=win0]")
    data = {
        i.attributes["name"]: i.attributes.get("value") or ""
        for i in form.css("input[type=hidden]")
        if i.attributes.get("name")
    }
    data["ICAction"] = VIEW_ALL_ACTION
    response = fetch.request("POST", form.attributes.get("action") or base, data=data)
    page = LexborHTMLParser(response.text)
    jobs = []
    for row in page.css('li[id^="HRS_AGNT_RSLT_I$0_row_"]'):
        n = row.attributes["id"].rsplit("_", 1)[-1]
        jobs.append({
            "title": _text(row, _id(f"SCH_JOB_TITLE${n}")),
            "id": _text(row, _id(f"HRS_APP_JBSCH_I_HRS_JOB_OPENING_ID${n}")),
            "location": _text(row, _id(f"LOCATION${n}")),
            "department": _text(row, _id(f"HRS_APP_JBSCH_I_HRS_DEPT_DESCR${n}")),
            "posted": _text(row, _id(f"SCH_OPENED${n}")),
            "closes": _text(row, _id(f"HRS_CLS_DT_DESCR${n}")),
        })
    return [job for job in jobs if job["id"]]


def detail(base: str, site_id: str, job_id: str, fetch: Fetcher, row: dict | None = None,
           seq: str = "1") -> dict:
    url = posting_url(base, site_id, job_id, seq)
    _, html = fetch.html(url)
    page = LexborHTMLParser(html)
    title = _text(page, _id("HRS_SCH_WRK2_POSTING_TITLE"))
    if not title and not row:
        raise NotFound(f"PeopleSoft job opening {job_id} is not posted")
    description = page.css_first(_id("HRS_SCH_PSTDSC_DESCRLONG$0"))
    row = row or {}
    return posting(
        title=title or row.get("title"),
        url=url,
        location_text=_text(page, _id("HRS_SCH_WRK_HRS_DESCRLONG")) or row.get("location"),
        description=description.inner_html if description else None,
        posted_at=_date(row.get("posted")),
        closes_at=_date(row.get("closes")),
        language=(page.css_first("html").attributes.get("lang") or "")[:2] or None,
        raw={
            "job_opening_id": job_id,
            "site_id": site_id,
            "department": row.get("department"),
            "full_part_time": _text(page, _id("HRS_SCH_WRK_HRS_FULL_PART_TIME")),
            "regular_temporary": _text(page, _id("HRS_SCH_WRK_HRS_REG_TEMP")),
            **{k: v for k, v in row.items() if k not in ("title",)},
        },
    )


def scrape(url: str, fetch: Fetcher) -> list[dict]:
    base, query = _base(url), _query(url)
    site_ids = [query["SiteId"]] if query.get("SiteId") else list(_SITE_IDS_TO_TRY)

    if job_id := query.get("JobOpeningId"):
        return [detail(base, site_ids[0], job_id, fetch, seq=query.get("PostingSeq", "1"))]

    for site_id in site_ids:
        try:
            home = _home(base, site_id, fetch)
        except NotAGuestSite:
            continue
        rows = list_jobs(base, home, fetch)[:MAX_POSTINGS]
        return [detail(base, site_id, row["id"], fetch, row) for row in rows]
    raise NotFound(f"no public PeopleSoft job search at {base} (tried SiteId {', '.join(site_ids)})")
