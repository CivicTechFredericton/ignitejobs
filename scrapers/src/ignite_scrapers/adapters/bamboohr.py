"""BambooHR: https://<company>.bamboohr.com/careers[/<id>]. The careers site is a JS app over
two JSON endpoints: /careers/list and /careers/<id>/detail."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

from ..fetch import Fetcher, NotFound
from . import MAX_POSTINGS, join, posting

_JOB_ID = re.compile(r"/careers/(\d+)")


def _job_id(url: str) -> str | None:
    parsed = urlparse(url)
    if match := _JOB_ID.search(parsed.path):
        return match.group(1)
    # Older links: /jobs/view.php?id=123
    return (parse_qs(parsed.query).get("id") or [None])[0] if "view.php" in parsed.path else None


def _location(job: dict) -> str:
    loc = job.get("location") or {}
    remote = "Remote" if job.get("isRemote") or str(job.get("locationType")) == "1" else None
    return join(loc.get("city"), loc.get("state"), remote)


def company(base: str, fetch: Fetcher) -> str | None:
    try:
        return fetch.json(f"{base}/careers/company-info")["result"]["name"]
    except (NotFound, KeyError, TypeError, ValueError):
        return None


def detail(base: str, job_id: str, fetch: Fetcher, organization: str | None) -> dict:
    job = fetch.json(f"{base}/careers/{job_id}/detail")["result"]["jobOpening"]
    return posting(
        title=job.get("jobOpeningName"),
        organization=organization,
        url=f"{base}/careers/{job_id}",
        location_text=_location(job),
        description=job.get("description"),
        posted_at=job.get("datePosted"),
        raw=job,
    )


def scrape(url: str, fetch: Fetcher) -> list[dict]:
    parsed = urlparse(url)
    base = f"https://{parsed.hostname}"
    if job_id := _job_id(url):
        return [detail(base, job_id, fetch, company(base, fetch))]
    jobs = fetch.json(f"{base}/careers/list")["result"]
    name = company(base, fetch) if jobs else None
    return [detail(base, str(job["id"]), fetch, name) for job in jobs[:MAX_POSTINGS]]
