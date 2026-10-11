"""Postgres-backed job queue. Workers claim rows with FOR UPDATE SKIP LOCKED."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

CHANNEL = "scrape_jobs"


@dataclass
class Job:
    id: str
    source_id: str | None
    posting_id: str | None
    strategy: str
    attempts: int
    max_attempts: int
    url: str


_CLAIM = """
UPDATE scrape_jobs j
SET status = 'running', attempts = j.attempts + 1, locked_at = now(), locked_by = %(worker)s
FROM (
  SELECT id FROM scrape_jobs
  WHERE status = 'queued' AND pool = %(pool)s AND run_after <= now()
  ORDER BY run_after
  FOR UPDATE SKIP LOCKED
  LIMIT 1
) next
WHERE j.id = next.id
RETURNING j.id, j.source_id, j.posting_id, j.strategy, j.attempts, j.max_attempts,
  coalesce((SELECT url FROM sources WHERE id = j.source_id),
           (SELECT url FROM postings WHERE id = j.posting_id)) AS url
"""


def claim(conn: Connection, pool: str, worker: str) -> Job | None:
    with conn.cursor(row_factory=dict_row) as cur:
        row = cur.execute(_CLAIM, {"pool": pool, "worker": worker}).fetchone()
    conn.commit()
    return Job(**row) if row else None


def succeed(conn: Connection, job: Job, result: dict[str, Any]) -> None:
    conn.execute(
        "UPDATE scrape_jobs SET status = 'succeeded', finished_at = now(), result = %s,"
        " last_error = NULL WHERE id = %s",
        (Jsonb(result), job.id),
    )
    if job.source_id:
        conn.execute("UPDATE sources SET last_scraped_at = now() WHERE id = %s", (job.source_id,))
    conn.commit()


def fail(conn: Connection, job: Job, error: str, *, blocked: bool = False) -> None:
    """Retry with exponential backoff; give up after max_attempts or when blocked."""
    final = blocked or job.attempts >= job.max_attempts
    conn.execute(
        """
        UPDATE scrape_jobs
        SET status = %(status)s, last_error = %(error)s, locked_at = NULL, locked_by = NULL,
            run_after = now() + make_interval(mins => power(2, %(attempts)s)::int),
            finished_at = CASE WHEN %(final)s THEN now() END
        WHERE id = %(id)s
        """,
        {
            "status": "blocked" if blocked else ("failed" if final else "queued"),
            "error": error[:2000],
            "attempts": job.attempts,
            "final": final,
            "id": job.id,
        },
    )
    if blocked and job.source_id:
        conn.execute("UPDATE sources SET status = 'blocked' WHERE id = %s", (job.source_id,))
    conn.commit()


def release_stale(conn: Connection, minutes: int = 15) -> int:
    """Requeue jobs whose worker died mid-run."""
    cur = conn.execute(
        "UPDATE scrape_jobs SET status = 'queued', locked_at = NULL, locked_by = NULL"
        " WHERE status = 'running' AND locked_at < now() - make_interval(mins => %s)",
        (minutes,),
    )
    conn.commit()
    return cur.rowcount


def reroute(conn: Connection, job: Job, pool: str) -> None:
    """Hand a job to another worker pool without counting it as an attempt."""
    conn.execute(
        "UPDATE scrape_jobs SET pool = %s, status = 'queued', attempts = attempts - 1,"
        " locked_at = NULL, locked_by = NULL WHERE id = %s",
        (pool, job.id),
    )
    conn.commit()
