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


GENERIC = Platform("generic")

# Ordered: first matching host pattern wins.
_PLATFORMS: list[tuple[re.Pattern[str], Platform]] = [
    (re.compile(r"(^|\.)linkedin\.com$|^lnkd\.in$"), Platform("linkedin", scrapable=False)),
    (re.compile(r"(^|\.)indeed\.com$"), Platform("indeed", pool="browser")),
    (re.compile(r"(^|\.)careerbeacon\.com$"), Platform("careerbeacon", pool="browser")),
    (re.compile(r"(^|\.)venor\.ca$"), Platform("venor")),
    (re.compile(r"\.bamboohr\.com$"), Platform("bamboohr")),
    (re.compile(r"\.myworkdayjobs\.com$"), Platform("workday")),
    (re.compile(r"\.oraclecloud\.com$"), Platform("oracle_hcm", pool="browser")),
    (re.compile(r"(^|\.)greenhouse\.io$"), Platform("greenhouse")),
    (re.compile(r"(^|\.)smartrecruiters\.com$"), Platform("smartrecruiters")),
    (re.compile(r"(^|\.)icims\.com$"), Platform("icims")),
    (re.compile(r"(^|\.)avature\.net$"), Platform("avature")),
    (re.compile(r"(^|\.)ultipro\.(ca|com)$"), Platform("ultipro", pool="browser")),
    (re.compile(r"^workforcenow\.adp\.com$"), Platform("adp", pool="browser")),
    (re.compile(r"(^|\.)jobbank\.gc\.ca$"), Platform("jobbank")),
]


def host_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host.removeprefix("www.")


def detect(url: str) -> Platform:
    host = host_of(url)
    for pattern, platform in _PLATFORMS:
        if pattern.search(host):
            return platform
    return GENERIC


def canonical_url(url: str) -> str:
    """Normalise URLs that carry tracking noise so the same posting de-duplicates."""
    parsed = urlparse(url)
    if detect(url).name == "indeed":
        jk = parse_qs(parsed.query).get("jk") or parse_qs(parsed.query).get("vjk")
        if jk:
            return f"https://ca.indeed.com/viewjob?jk={jk[0]}"
    return parsed._replace(fragment="").geturl()
