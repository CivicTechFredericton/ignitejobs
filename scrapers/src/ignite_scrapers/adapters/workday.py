"""Workday: https://<tenant>.wd<N>.myworkdayjobs.com/[<locale>/]<site>[/job/...]. The careers
site is a JS app over the "cxs" JSON API. Query parameters on a careers page URL (e.g.
?locations=...) are search facets and are passed through, so a moderator can paste a filtered
search and get just those jobs."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

from ..fetch import Blocked, Fetcher, NotFound
from . import MAX_POSTINGS, join, posting

_LOCALE = re.compile(r"^[a-z]{2}(-[A-Z]{2})?$")
PAGE_SIZE = 20


def parse(url: str) -> tuple[str, str, str | None]:
    """Return (cxs API base, public site base, job path like '/job/City/Title_R123' or None)."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    tenant = host.split(".")[0]
    segments = [s for s in parsed.path.split("/") if s]
    locale = segments.pop(0) if segments and _LOCALE.match(segments[0]) else None
    if not segments:
        raise ValueError(f"no Workday site in URL: {url}")
    site, rest = segments[0], segments[1:]
    api = f"https://{host}/wday/cxs/{tenant}/{site}"
    public = f"https://{host}/{locale + '/' if locale else ''}{site}"
    job_path = "/" + "/".join(rest) if rest and rest[0] == "job" else None
    return api, public, job_path


def detail(api: str, public: str, job_path: str, fetch: Fetcher) -> dict:
    data = fetch.json(f"{api}{job_path}")
    info = data["jobPostingInfo"]
    return posting(
        title=info.get("title"),
        url=f"{public}{job_path}",
        organization=(data.get("hiringOrganization") or {}).get("name"),
        location_text=join(
            info.get("location"),
            *(info.get("additionalLocations") or []),
            "Remote"
            if info.get("remoteType") == "Remote"
            and "remote" not in " ".join(info.get("additionalLocations") or []).lower()
            else None,
        ),
        description=info.get("jobDescription"),
        posted_at=info.get("startDate"),
        closes_at=info.get("endDate"),
        raw={k: v for k, v in info.items() if k != "jobDescription"},
    )


def _list(api: str, facets: dict, offset: int, fetch: Fetcher) -> dict:
    return fetch.post_json(
        f"{api}/jobs",
        {"appliedFacets": facets, "limit": PAGE_SIZE, "offset": offset, "searchText": ""},
    )


def scrape(url: str, fetch: Fetcher) -> list[dict]:
    api, public, job_path = parse(url)
    if job_path:
        try:
            return [detail(api, public, job_path, fetch)]
        except Blocked:
            # Workday answers 403 "permission denied" for a posting it no longer lists. If the
            # board itself still answers, we are not blocked: the posting is gone.
            _list(api, {}, 0, fetch)
            raise NotFound(f"Workday no longer lists {job_path}") from None
    facets = parse_qs(urlparse(url).query)
    paths: list[str] = []
    while len(paths) < MAX_POSTINGS:
        page = _list(api, facets, len(paths), fetch)
        batch = [p["externalPath"] for p in page.get("jobPostings", [])]
        paths += batch
        if not batch or len(paths) >= page.get("total", 0):
            break
    return [detail(api, public, p, fetch) for p in paths[:MAX_POSTINGS]]
