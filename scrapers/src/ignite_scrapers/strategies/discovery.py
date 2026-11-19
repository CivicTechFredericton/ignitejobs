"""Find links to individual postings on a careers page, for sites without a platform API."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from ..platforms import canonical_url, host_of

# Path segments that usually introduce one posting, in English and French.
_JOB_PATH = re.compile(
    r"/(jobs?|careers?|opportunit\w*|postings?|positions?|vacanc\w*|openings?|details|"
    r"emplois?|offres?(-d-emploi)?|carrieres?|postes?)/[^/?#]+",
    re.IGNORECASE,
)
_SKIP_EXT = re.compile(r"\.(pdf|docx?|jpe?g|png|gif|svg|zip)$", re.IGNORECASE)


def job_links(html: str, base_url: str, limit: int = 25) -> list[str]:
    base_host = host_of(base_url)
    base_path = urlparse(base_url).path.rstrip("/")
    links: dict[str, None] = {}
    for anchor in HTMLParser(html).css("a[href]"):
        url = urljoin(base_url, anchor.attributes.get("href") or "").split("#")[0]
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or host_of(url) != base_host:
            continue
        path = parsed.path.rstrip("/")
        if path == base_path or _SKIP_EXT.search(path) or not _JOB_PATH.search(path):
            continue
        # A posting lives below a listing segment, so it has at least two segments.
        if path.count("/") < 2:
            continue
        links[canonical_url(url)] = None
        if len(links) >= limit:
            break
    return list(links)
