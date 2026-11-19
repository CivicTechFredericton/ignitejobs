"""Try the scrapers on a URL without a database:

    uv run ignite-scrape https://gemtec.bamboohr.com/careers
    uv run ignite-scrape --kind posting https://ca.indeed.com/viewjob?jk=...
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

import httpx

from . import pipeline
from .fetch import Blocked, Fetcher, NotFound
from .worker import LazyBrowser


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("url")
    parser.add_argument("--kind", choices=["careers_page", "posting"], default="careers_page")
    parser.add_argument("--json", action="store_true", help="print postings as JSON")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

    fetcher = Fetcher()
    browser = LazyBrowser(fetcher)
    pool = "http"
    try:
        while True:
            try:
                platform, strategy, postings = pipeline.scrape(
                    args.url, args.kind, pool, fetcher, browser if pool == "browser" else None
                )
                break
            except pipeline.Escalate as exc:
                print(f"-> escalating to the browser: {exc}", file=sys.stderr)
                pool = "browser"
    except (pipeline.ManualOnly, pipeline.NoPostings, Blocked, NotFound) as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
    except (httpx.HTTPError, ValueError, KeyError) as exc:  # the worker retries these
        print(f"error (the worker would retry): {exc!r}", file=sys.stderr)
        sys.exit(2)
    finally:
        browser.close()
        fetcher.close()

    if args.json:
        slim = [{k: v for k, v in p.items() if k not in ("raw", "description")} for p in postings]
        print(json.dumps(slim, indent=2, default=str))
        return
    print(f"{platform.name} via {strategy}: {len(postings)} postings", file=sys.stderr)
    for p in postings:
        desc = len(p.get("description") or "")
        print(f"- {p['title']} | {p.get('organization') or '?'} | {p.get('location_text') or '?'}"
              f" | posted {p.get('posted_at') or '?'} | {desc} chars\n  {p['url']}")


if __name__ == "__main__":
    main()
