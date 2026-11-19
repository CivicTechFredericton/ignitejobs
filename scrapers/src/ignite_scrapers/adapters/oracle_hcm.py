"""Oracle Recruiting Cloud (HCM): https://<pod>.fa.<dc>.oraclecloud.com/hcmUI/
CandidateExperience/<lang>/sites/<site>/job/<id> (or .../jobs for the whole site). The
candidate site is a JS app over the public hcmRestApi recruiting endpoints."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from ..fetch import Fetcher, NotFound
from . import MAX_POSTINGS, join, posting

_PATH = re.compile(
    r"/CandidateExperience/(?P<lang>[\w-]+)/sites/(?P<site>[\w-]+)(?:/(?:job|requisitions/preview)/(?P<id>\d+))?"
)
PAGE_SIZE = 25


def parse(url: str) -> tuple[str, str, str, str | None]:
    parsed = urlparse(url)
    match = _PATH.search(parsed.path)
    if not match:
        raise ValueError(f"not an Oracle candidate site URL: {url}")
    return f"https://{parsed.hostname}", match["lang"], match["site"], match["id"]


def detail(base: str, lang: str, site: str, job_id: str, fetch: Fetcher) -> dict:
    data = fetch.json(
        f"{base}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails",
        params={
            "expand": "all",
            "onlyData": "true",
            "finder": f'ById;Id="{job_id}",siteNumber={site}',
        },
    )
    if not data.get("items"):
        raise NotFound(f"requisition {job_id} is not posted on {site}")
    job = data["items"][0]
    description = "".join(
        job.get(key) or ""
        for key in (
            "ExternalDescriptionStr",
            "ExternalResponsibilitiesStr",
            "ExternalQualificationsStr",
            "CorporateDescriptionStr",
        )
    )
    return posting(
        title=job.get("Title"),
        url=f"{base}/hcmUI/CandidateExperience/{lang}/sites/{site}/job/{job_id}",
        organization=job.get("LegalEmployer") or job.get("BusinessUnit"),
        location_text=join(
            job.get("PrimaryLocation"), *(loc.get("Name") for loc in job.get("secondaryLocations") or [])
        ),
        description=description,
        posted_at=job.get("ExternalPostedStartDate"),
        closes_at=job.get("ExternalPostedEndDate"),
        language=job.get("ContentLocale"),
        raw={k: v for k, v in job.items() if not k.endswith("Str")},
    )


def scrape(url: str, fetch: Fetcher) -> list[dict]:
    base, lang, site, job_id = parse(url)
    if job_id:
        return [detail(base, lang, site, job_id, fetch)]
    ids: list[str] = []
    while len(ids) < MAX_POSTINGS:
        data = fetch.json(
            f"{base}/hcmRestApi/resources/latest/recruitingCEJobRequisitions",
            params={
                "onlyData": "true",
                "expand": "requisitionList",
                "finder": f"findReqs;siteNumber={site},limit={PAGE_SIZE},offset={len(ids)}",
            },
        )
        search = data["items"][0]
        batch = [r["Id"] for r in search.get("requisitionList") or []]
        ids += batch
        if not batch or len(ids) >= search.get("TotalJobsCount", 0):
            break
    return [detail(base, lang, site, i, fetch) for i in ids[:MAX_POSTINGS]]
