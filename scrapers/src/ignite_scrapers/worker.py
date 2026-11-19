"""Scrape worker: claims queued jobs for one pool and runs the strategy chain on each.

    ignite-worker --pool http      # platform APIs + JSON-LD over plain HTTP
    ignite-worker --pool browser   # headless Chromium for JS-rendered or picky sites
"""

from __future__ import annotations

import argparse
import logging
import os
import socket
import time

import psycopg

from . import pipeline, queue, store
from .fetch import Blocked, Fetcher, NotFound

log = logging.getLogger("ignite.worker")


class LazyBrowser:
    """Start Chromium on first use and keep it for the life of the worker."""

    def __init__(self, fetcher: Fetcher) -> None:
        self._fetcher = fetcher
        self._browser = None

    def __call__(self):
        if self._browser is None:
            from .browser import Browser  # Playwright is only installed in the browser image

            self._browser = Browser(self._fetcher.pacer)
        return self._browser

    def close(self) -> None:
        if self._browser is not None:
            self._browser.close()


def run_job(
    conn: psycopg.Connection, job: queue.Job, pool: str, fetcher: Fetcher, browser: LazyBrowser
) -> None:
    kind = job.kind or "posting"
    try:
        platform, strategy, postings = pipeline.scrape(
            job.url, kind, pool, fetcher, browser if pool == "browser" else None
        )
        ids = [store.upsert_posting(conn, job.source_id, p) for p in postings if p.get("title")]
    except pipeline.Escalate as exc:
        conn.rollback()
        queue.reroute(conn, job, "browser")
        log.info("job %s -> browser pool (%s)", job.id, exc)
        return
    except pipeline.ManualOnly as exc:
        conn.rollback()
        queue.fail(conn, job, str(exc), outcome="manual_only", blocked=True)
        log.info("job %s manual only: %s", job.id, exc)
        return
    except Blocked as exc:
        conn.rollback()
        queue.fail(conn, job, str(exc), outcome="blocked", blocked=True)
        log.info("job %s blocked: %s", job.id, exc)
        return
    except NotFound as exc:
        conn.rollback()
        closed = store.close_gone(conn, job.source_id, job.posting_id) if kind == "posting" else 0
        queue.fail(conn, job, f"Page no longer available: {exc}", outcome="gone", final=True)
        log.info("job %s: gone (%d postings closed)", job.id, closed)
        return
    except pipeline.NoPostings as exc:
        conn.rollback()
        queue.fail(conn, job, str(exc), outcome="no_postings", final=True)
        return
    except Exception as exc:  # every other failure is recorded on the job row and retried
        conn.rollback()
        log.exception("job %s failed", job.id)
        queue.fail(conn, job, repr(exc))
        return
    if job.source_id:
        conn.execute(
            "UPDATE sources SET platform = %s WHERE id = %s AND platform <> %s",
            (platform.name, job.source_id, platform.name),
        )
    queue.succeed(conn, job, {"platform": platform.name, "strategy": strategy, "postings": ids})
    log.info("job %s: %d postings from %s via %s", job.id, len(ids), job.url, strategy)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pool", default=os.environ.get("SCRAPER_POOL", "http"), choices=["http", "browser"]
    )
    parser.add_argument("--idle-seconds", type=float, default=30.0)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    worker_id = f"{socket.gethostname()}:{os.getpid()}:{args.pool}"
    url = os.environ["DATABASE_URL"]
    fetcher = Fetcher()
    browser = LazyBrowser(fetcher)
    try:
        with psycopg.connect(url) as conn, psycopg.connect(url, autocommit=True) as listener:
            listener.execute(f"LISTEN {queue.CHANNEL}")
            log.info("worker %s listening on pool %s", worker_id, args.pool)
            while True:
                queue.release_stale(conn)
                while job := queue.claim(conn, args.pool, worker_id):
                    run_job(conn, job, args.pool, fetcher, browser)
                # Sleep until a NOTIFY arrives or the idle timeout passes (retries come due).
                for _ in listener.notifies(timeout=args.idle_seconds, stop_after=1):
                    pass
                time.sleep(0.1)
    finally:
        browser.close()
        fetcher.close()


if __name__ == "__main__":
    main()
