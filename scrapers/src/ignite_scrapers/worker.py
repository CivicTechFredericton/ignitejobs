"""Scrape worker: claims queued jobs for one pool and runs the matching strategy."""

from __future__ import annotations

import argparse
import logging
import os
import socket
import time

import httpx
import psycopg

from . import platforms, queue, store
from .strategies import json_ld

log = logging.getLogger("ignite.worker")

USER_AGENT = os.environ.get("SCRAPER_USER_AGENT", "IgniteJobBoardBot/0.1")


class Blocked(Exception):
    """The site refused us (challenge page, 403, ...). Stop and leave it to a moderator."""


def scrape_http(job: queue.Job, client: httpx.Client) -> list[dict]:
    response = client.get(job.url)
    if response.status_code in (401, 403, 429):
        raise Blocked(f"HTTP {response.status_code}")
    response.raise_for_status()
    nodes = json_ld.job_postings(response.text, str(response.url))
    return [json_ld.to_posting(node, str(response.url)) for node in nodes]


def run_job(conn: psycopg.Connection, job: queue.Job, client: httpx.Client, pool: str) -> None:
    platform = platforms.detect(job.url)
    if job.source_id:
        conn.execute(
            "UPDATE sources SET platform = %s WHERE id = %s AND platform <> %s",
            (platform.name, job.source_id, platform.name),
        )
        conn.commit()
    if not platform.scrapable:
        queue.fail(conn, job, f"{platform.name} is manual-entry only", blocked=True)
        return
    if platform.pool != pool:
        queue.reroute(conn, job, platform.pool)
        log.info("job %s rerouted to %s pool (%s)", job.id, platform.pool, platform.name)
        return
    try:
        postings = scrape_http(job, client)
        ids = [store.upsert_posting(conn, job.source_id, p) for p in postings if p.get("title")]
    except Blocked as exc:
        conn.rollback()
        queue.fail(conn, job, str(exc), blocked=True)
        return
    except Exception as exc:  # every failure is recorded on the job row
        conn.rollback()
        log.exception("job %s failed", job.id)
        queue.fail(conn, job, repr(exc))
        return
    queue.succeed(conn, job, {"platform": platform.name, "postings": ids})
    log.info("job %s: %d postings from %s", job.id, len(ids), job.url)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool", default=os.environ.get("SCRAPER_POOL", "http"))
    parser.add_argument("--idle-seconds", type=float, default=30.0)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    if args.pool != "http":
        raise SystemExit(f"pool {args.pool!r} is not implemented yet")

    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    url = os.environ["DATABASE_URL"]
    with (
        psycopg.connect(url) as conn,
        psycopg.connect(url, autocommit=True) as listener,
        httpx.Client(
            headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30.0
        ) as client,
    ):
        listener.execute(f"LISTEN {queue.CHANNEL}")
        log.info("worker %s listening on pool %s", worker_id, args.pool)
        while True:
            queue.release_stale(conn)
            while job := queue.claim(conn, args.pool, worker_id):
                run_job(conn, job, client, args.pool)
            # Sleep until a NOTIFY arrives or the idle timeout passes (retries come due).
            for _ in listener.notifies(timeout=args.idle_seconds, stop_after=1):
                pass
            time.sleep(0.1)


if __name__ == "__main__":
    main()
