"""Persist scraped postings. Everything lands as `pending` for moderator review."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb


def normalize_org(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def upsert_organization(conn: Connection, name: str | None) -> str | None:
    if not name:
        return None
    row = conn.execute(
        """
        INSERT INTO organizations (name, normalized_name) VALUES (%s, %s)
        ON CONFLICT (normalized_name) DO UPDATE SET name = organizations.name
        RETURNING id
        """,
        (name, normalize_org(name)),
    ).fetchone()
    return str(row[0])


def upsert_posting(conn: Connection, source_id: str | None, posting: dict[str, Any]) -> str:
    content_hash = hashlib.sha256(
        json.dumps(posting.get("raw"), sort_keys=True, default=str).encode()
    ).hexdigest()
    org_id = upsert_organization(conn, posting.get("organization"))
    # Re-scrapes refresh content but never touch moderator decisions (status, taxonomy).
    row = conn.execute(
        """
        INSERT INTO postings (source_id, organization_id, title, url, location_text, description,
                              raw, content_hash, posted_at, closes_at, origin)
        VALUES (%(source_id)s, %(org_id)s, %(title)s, %(url)s, %(location_text)s, %(description)s,
                %(raw)s, %(hash)s, %(posted_at)s, %(closes_at)s, 'scraped')
        ON CONFLICT (url) DO UPDATE SET
          title = excluded.title, location_text = excluded.location_text,
          description = excluded.description, raw = excluded.raw,
          content_hash = excluded.content_hash, closes_at = excluded.closes_at,
          organization_id = coalesce(postings.organization_id, excluded.organization_id),
          updated_at = now()
        RETURNING id
        """,
        {
            **posting,
            "source_id": source_id,
            "org_id": org_id,
            "raw": Jsonb(posting.get("raw")),
            "hash": content_hash,
        },
    ).fetchone()
    return str(row[0])
