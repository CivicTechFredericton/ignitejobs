"""Greenhouse: boards.greenhouse.io/<board>[/jobs/<id>] (also job-boards.greenhouse.io and the
embed form ?for=<board>&token=<id>), read through the public Job Board API."""

from __future__ import annotations

import html
import re
from urllib.parse import parse_qs, urlparse

from ..fetch import Fetcher
from . import MAX_POSTINGS, posting

API = "https://boards-api.greenhouse.io/v1/boards"
_PATH = re.compile(r"^/(?P<board>[\w-]+)(?:/jobs/(?P<id>\d+))?")


def parse(url: str) -> tuple[str, str | None]:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if "for" in query:  # /embed/job_board?for=acme or /embed/job_app?for=acme&token=123
        return query["for"][0], (query.get("token") or query.get("gh_jid") or [None])[0]
    match = _PATH.match(parsed.path)
    if not match:
        raise ValueError(f"not a Greenhouse board URL: {url}")
    return match["board"], match["id"] or (query.get("gh_jid") or [None])[0]


def to_posting(job: dict, company: str | None) -> dict:
    return posting(
        title=job.get("title"),
        url=job["absolute_url"],
        organization=job.get("company_name") or company,
        location_text=(job.get("location") or {}).get("name"),
        # The API returns the description HTML-escaped.
        description=html.unescape(job.get("content") or ""),
        posted_at=job.get("first_published") or job.get("updated_at"),
        closes_at=job.get("application_deadline"),
        language=job.get("language"),
        raw={k: v for k, v in job.items() if k not in ("questions", "content")},
    )


def scrape(url: str, fetch: Fetcher) -> list[dict]:
    board, job_id = parse(url)
    if job_id:
        return [to_posting(fetch.json(f"{API}/{board}/jobs/{job_id}"), None)]
    company = fetch.json(f"{API}/{board}").get("name")
    jobs = fetch.json(f"{API}/{board}/jobs", params={"content": "true"})["jobs"]
    return [to_posting(job, company) for job in jobs[:MAX_POSTINGS]]
