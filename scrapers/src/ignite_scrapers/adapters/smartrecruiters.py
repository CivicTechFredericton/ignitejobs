"""SmartRecruiters: jobs.smartrecruiters.com/<Company>[/<id>-<slug>] or
careers.smartrecruiters.com/<Company>, read through the public Posting API."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from ..fetch import Fetcher
from . import MAX_POSTINGS, join, posting

API = "https://api.smartrecruiters.com/v1/companies"
_PATH = re.compile(r"^/(?P<company>[\w.-]+)(?:/(?P<id>\d+)(?:-[^/]*)?)?")


def parse(url: str) -> tuple[str, str | None]:
    match = _PATH.match(urlparse(url).path)
    if not match:
        raise ValueError(f"not a SmartRecruiters URL: {url}")
    return match["company"], match["id"]


def to_posting(job: dict) -> dict:
    location = job.get("location") or {}
    sections = (job.get("jobAd") or {}).get("sections") or {}
    description = "".join(
        f"<h3>{s['title']}</h3>{s['text']}" if s.get("title") else s.get("text", "")
        for key in ("companyDescription", "jobDescription", "qualifications", "additionalInformation")
        if (s := sections.get(key)) and s.get("text")
    )
    return posting(
        title=job.get("name"),
        url=job.get("postingUrl")
        or f"https://jobs.smartrecruiters.com/{job['company']['identifier']}/{job['id']}",
        organization=(job.get("company") or {}).get("name"),
        location_text=join(
            location.get("fullLocation") or join(location.get("city"), location.get("region")),
            "Remote" if location.get("remote") else None,
        ),
        description=description,
        posted_at=job.get("releasedDate"),
        language=(job.get("language") or {}).get("code"),
        raw={k: v for k, v in job.items() if k != "jobAd"},
    )


def scrape(url: str, fetch: Fetcher) -> list[dict]:
    company, job_id = parse(url)
    if job_id:
        return [to_posting(fetch.json(f"{API}/{company}/postings/{job_id}"))]
    ids: list[str] = []
    while len(ids) < MAX_POSTINGS:
        page = fetch.json(f"{API}/{company}/postings", params={"limit": 100, "offset": len(ids)})
        ids += [p["id"] for p in page.get("content", [])]
        if not page.get("content") or len(ids) >= page.get("totalFound", 0):
            break
    return [to_posting(fetch.json(f"{API}/{company}/postings/{i}")) for i in ids[:MAX_POSTINGS]]
