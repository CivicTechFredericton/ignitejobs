"""Extract schema.org JobPosting data embedded as JSON-LD or microdata (itemprop=...), e.g.
SAP SuccessFactors career sites use microdata."""

from __future__ import annotations

import html
from typing import Any

import extruct
from selectolax.lexbor import LexborHTMLParser


def _walk(node: Any):
    if isinstance(node, list):
        for item in node:
            yield from _walk(item)
    elif isinstance(node, dict):
        yield node
        yield from _walk(node.get("@graph", []))


def _is_job_posting(node: dict[str, Any]) -> bool:
    kind = node.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    return "JobPosting" in kinds


def job_postings(html: str, base_url: str) -> list[dict[str, Any]]:
    data = extruct.extract(html, base_url=base_url, syntaxes=["json-ld", "microdata"], uniform=True)
    found = [node for node in _walk(data.get("json-ld", [])) if _is_job_posting(node)]
    if found:
        return found
    found = [node for node in _walk(data.get("microdata", [])) if _is_job_posting(node)]
    if len(found) == 1:
        # Microdata yields the description as flat text; keep the element's HTML structure.
        element = LexborHTMLParser(html).css_first('[itemprop="description"]')
        if element is not None:
            found[0]["description"] = element.inner_html.strip()
    return found


def _text(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("name")
    if isinstance(value, list):
        return ", ".join(filter(None, (_text(v) for v in value))) or None
    return str(value) if value else None


def _place_name(address: Any) -> str | None:
    if isinstance(address, dict):
        # SuccessFactors microdata only fills streetAddress (with the city name).
        return address.get("addressLocality") or address.get("streetAddress") or address.get("addressRegion")
    return str(address) if address else None


def _location(node: dict[str, Any]) -> str | None:
    places = node.get("jobLocation")
    places = places if isinstance(places, list) else [places]
    parts = []
    for place in filter(None, places):
        address = place.get("address") if isinstance(place, dict) else place
        addresses = address if isinstance(address, list) else [address]
        parts += [_place_name(a) for a in addresses]
    if node.get("jobLocationType") == "TELECOMMUTE":
        parts.append("Remote")
    return ", ".join(dict.fromkeys(filter(None, parts))) or None


def to_posting(node: dict[str, Any], url: str) -> dict[str, Any]:
    """Map a JobPosting node onto the columns of the `postings` table."""
    return {
        "title": html.unescape(_text(node.get("title")) or "") or None,
        "organization": _text(node.get("hiringOrganization")),
        "location_text": _location(node),
        "description": node.get("description"),
        "posted_at": node.get("datePosted"),
        "closes_at": node.get("validThrough"),
        "url": node.get("url") or url,
        "language": _text(node.get("inLanguage")),
        "raw": node,
    }
