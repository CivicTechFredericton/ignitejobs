"""Extract schema.org JobPosting data embedded as JSON-LD."""

from __future__ import annotations

from typing import Any

import extruct


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
    data = extruct.extract(html, base_url=base_url, syntaxes=["json-ld"], uniform=True)
    return [node for node in _walk(data.get("json-ld", [])) if _is_job_posting(node)]


def _text(value: Any) -> str | None:
    if isinstance(value, dict):
        return value.get("name")
    if isinstance(value, list):
        return ", ".join(filter(None, (_text(v) for v in value))) or None
    return str(value) if value else None


def _location(node: dict[str, Any]) -> str | None:
    places = node.get("jobLocation")
    places = places if isinstance(places, list) else [places]
    parts = []
    for place in filter(None, places):
        address = place.get("address", {}) if isinstance(place, dict) else {}
        if isinstance(address, dict):
            parts.append(address.get("addressLocality") or address.get("addressRegion"))
        else:
            parts.append(str(address))
    if node.get("jobLocationType") == "TELECOMMUTE":
        parts.append("Remote")
    return ", ".join(dict.fromkeys(filter(None, parts))) or None


def to_posting(node: dict[str, Any], url: str) -> dict[str, Any]:
    """Map a JobPosting node onto the columns of the `postings` table."""
    return {
        "title": _text(node.get("title")),
        "organization": _text(node.get("hiringOrganization")),
        "location_text": _location(node),
        "description": node.get("description"),
        "posted_at": node.get("datePosted"),
        "closes_at": node.get("validThrough"),
        "url": node.get("url") or url,
        "raw": node,
    }
