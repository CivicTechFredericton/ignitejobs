"""Map a URL to the job platform hosting it, which decides how it is scraped."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse


@dataclass(frozen=True)
class Platform:
    name: str
    # "http" workers handle plain HTTP; "browser" workers run Playwright.
    pool: str = "http"
    # False means the platform must never be fetched (moderators enter postings by hand).
    scrapable: bool = True
    # Name of a module in ignite_scrapers.adapters that talks to the platform's own API.
    adapter: str | None = None


GENERIC = Platform("generic")

# Ordered: first matching host pattern wins.
_PLATFORMS: list[tuple[re.Pattern[str], Platform]] = [
    (re.compile(r"(^|\.)linkedin\.com$|^lnkd\.in$"), Platform("linkedin", scrapable=False)),
    (re.compile(r"(^|\.)indeed\.com$"), Platform("indeed", pool="browser")),
    (re.compile(r"(^|\.)careerbeacon\.com$"), Platform("careerbeacon", pool="browser")),
    (re.compile(r"(^|\.)venor\.ca$"), Platform("venor")),
    (re.compile(r"\.bamboohr\.com$"), Platform("bamboohr", adapter="bamboohr")),
    (re.compile(r"\.myworkdayjobs\.com$"), Platform("workday", adapter="workday")),
    (re.compile(r"\.oraclecloud\.com$"), Platform("oracle_hcm", adapter="oracle_hcm")),
    (re.compile(r"(^|\.)greenhouse\.io$"), Platform("greenhouse", adapter="greenhouse")),
    (re.compile(r"(^|\.)smartrecruiters\.com$"), Platform("smartrecruiters", adapter="smartrecruiters")),
    (re.compile(r"(^|\.)icims\.com$"), Platform("icims")),
    (re.compile(r"(^|\.)avature\.net$"), Platform("avature")),
    (re.compile(r"(^|\.)ultipro\.(ca|com)$"), Platform("ultipro", adapter="ultipro")),
    (re.compile(r"^workforcenow\.adp\.com$"), Platform("adp", pool="browser")),
    (re.compile(r"(^|\.)jobbank\.gc\.ca$"), Platform("jobbank")),
    (re.compile(r"^emploisfp-psjobs\.cfp-psc\.gc\.ca$"),
     Platform("gcjobs", pool="browser", adapter="gcjobs")),
]


# Platforms that live on the employer's own domain, recognised by URL path instead of host.
_PATH_PLATFORMS: list[tuple[re.Pattern[str], Platform]] = [
    # PeopleSoft Candidate Gateway: .../HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL (also the classic page)
    (re.compile(r"/psc/.+\.HRS_CG_SEARCH(_FL)?\.GBL", re.IGNORECASE),
     Platform("peoplesoft", adapter="peoplesoft")),
]


def host_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host.removeprefix("www.")


def is_indeed_posting(url: str) -> bool:
    """Indeed is scraped only one posting at a time (viewjob?jk=...), never search or company pages."""
    query = parse_qs(urlparse(url).query)
    return bool(query.get("jk") or query.get("vjk"))


def detect(url: str) -> Platform:
    host = host_of(url)
    for pattern, platform in _PLATFORMS:
        if pattern.search(host):
            return platform
    path = urlparse(url).path
    for pattern, platform in _PATH_PLATFORMS:
        if pattern.search(path):
            return platform
    return GENERIC


_CAREERBEACON_JOB = re.compile(r"/(?:details/[^/]+|(?:en|fr)/(job(?:-\d+)?))/(\d+)")


def canonical_url(url: str) -> str:
    """Normalise URLs that carry tracking noise so the same posting de-duplicates."""
    parsed = urlparse(url)
    name = detect(url).name
    if name == "indeed":
        jk = parse_qs(parsed.query).get("jk") or parse_qs(parsed.query).get("vjk")
        if jk:
            return f"https://ca.indeed.com/viewjob?jk={jk[0]}"
    if name == "careerbeacon" and (match := _CAREERBEACON_JOB.search(parsed.path)):
        # One posting has several URL shapes; jobs.careerbeacon.com/details/... sits behind a
        # bot challenge while www.careerbeacon.com/en/job/<id> serves the same posting openly.
        # "job-<n>" marks a posting syndicated from another board; its id space differs.
        return f"https://www.careerbeacon.com/en/{match.group(1) or 'job'}/{match.group(2)}"
    return parsed._replace(fragment="").geturl()
