"""GC Jobs against trimmed copies of the real pages (Nov 2026)."""

import json

import httpx
import pytest

from ignite_scrapers import pipeline
from ignite_scrapers.adapters import gcjobs
from ignite_scrapers.fetch import Fetcher, Pacer

SEARCH_URL = (
    "https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant/page2440?tab=1&title="
    "&locationsFilter=fredericton&departments=&search=Search%20jobs&log=false"
)


def result(poster, title, org, location="Various Locations"):
    return f"""<li class="searchResult"><div><strong><a href="/psrs-srfp/applicant/page1800?poster={poster}">{title}</a></strong></div>
    <div class="tableTable"><div class="tableRow"><div class="tableCell">
      Closing date: 2026-11-20 <br> {org} <br> {location}
    </div><div class="tableCell">Bilingual</div></div></div></li>"""


def results_page(items, page, pages):
    return f"""<html><body><span class="pagelinks">[First / Previous] Page <strong>{page}</strong> of {pages}</span>
    <ul>{"".join(items)}</ul></body></html>"""


POSTER = """<html lang="en"><body><main><h1><span>Manager, Marine Safety</span></h1>
<h2 class="pst-h2">Transport Canada - Transport Canada – Marine Safety and Security</h2>
<h3 class="pst-h3 text-success">Closing date: November 20, 2026 - 23:59, Pacific Time</h3>
<div class="templates-container"><form><button>Apply</button></form>
<div class="bottomSpace"><b>Reference number</b> MOT26J-038615-001080</div>
<div class="bottomSpace"><b>Location</b> Various locations</div>
<div class="bottomSpace"><b>Salary</b> $123,575 to $144,530</div>
<h2>About the position</h2><p>Duties</p></div></main></body></html>"""

EXIT = """<html lang="en"><body><main><h1>You will leave the GC Jobs Web site</h1>
<a href="https://careers.example.ca/job/Ottawa-Modeller/1/">Senior Specialist, Modelling</a></main></body></html>"""

MICRODATA = """<html><body><div itemscope itemtype="http://schema.org/JobPosting">
<span itemprop="title">Senior Specialist, Modelling</span><span itemprop="hiringOrganization">CMHC - SCHL</span>
<div itemprop="description"><p>Model things.</p></div>
<div itemprop="jobLocation" itemscope itemtype="http://schema.org/Place"><div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress"><span itemprop="streetAddress">Ottawa</span></div></div>
</div></body></html>"""


OLD_LAYOUT = """<html lang="en"><body><main><h1>Stock Assessment Technician</h1>
<div class="rightRefNumberWithPadding">Reference number: DFO24J-071696-000581</div>
<fieldset class="widthFieldset">Fisheries and Oceans Canada - Fraser Interior Area</fieldset>
<h2>Duties</h2><p>Count fish.</p></main></body></html>"""


class NoWait(Pacer):
    def wait(self, url):
        pass


def fetcher(external=MICRODATA):
    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        if "ajaxFilter" in params:
            assert request.headers["X-Requested-With"] == "XMLHttpRequest"
            return httpx.Response(200, json=[{"LOCATION_CD": "W", "LOCATION_DESC": "Fredericton (New Brunswick)", "LOCATION_ID": 401}])
        if params.get("poster") == "1":
            return httpx.Response(200, html=POSTER)
        if params.get("poster") in ("2", "3"):
            return httpx.Response(200, html=EXIT)
        if params.get("poster") == "5":
            return httpx.Response(200, html=OLD_LAYOUT)
        if request.url.path.startswith("/srs-sre/"):
            return httpx.Response(200, html="<html><body>Student programme</body></html>")
        if request.url.host == "careers.example.ca":
            return httpx.Response(200, html=external) if external else httpx.Response(403)
        return httpx.Response(404)

    return Fetcher(httpx.Client(transport=httpx.MockTransport(handler)), NoWait())


class FakeBrowser:
    """Serves search result pages in order and records the URLs it was asked for."""

    def __init__(self, pages):
        self.pages, self.urls = pages, []

    def html(self, url, wait_for=None):
        assert wait_for == gcjobs.RESULTS
        self.urls.append(url)
        return url, self.pages[len(self.urls) - 1]


def test_search_resolves_location_pages_through_results_and_reads_postings():
    browser = FakeBrowser([
        results_page([result(1, "Manager, Marine Safety", "Transport Canada - Marine Safety")], 1, 2),
        results_page([result(2, "Senior Specialist, Modelling", "Canada Mortgage and Housing Corporation")], 2, 2),
    ])
    marine, modelling = gcjobs.scrape(SEARCH_URL, fetcher(), browser)

    assert "location=W401" in browser.urls[0] and "locationsFilter" not in browser.urls[0]
    assert browser.urls[1].endswith("page2440?requestedPage=2&fromPage=1&tab=1&log=false")

    assert marine["organization"] == "Transport Canada"
    assert marine["location_text"] == "Various locations, including Fredericton (New Brunswick)"
    assert marine["closes_at"] == "2026-11-20"
    assert "About the position" in marine["description"] and "<form" not in marine["description"]
    assert marine["raw"]["salary"] == "$123,575 to $144,530"

    # Hosted by the employer: read from their page, keep GC Jobs' location wording.
    assert modelling["url"] == "https://careers.example.ca/job/Ottawa-Modeller/1/"
    assert modelling["description"] == "<p>Model things.</p>"
    assert modelling["location_text"] == "Various Locations, including Fredericton (New Brunswick)"


def test_external_posting_falls_back_to_search_row():
    browser = FakeBrowser([results_page([result(3, "Junior Developer", "Canada Mortgage and Housing Corporation", "Ottawa (Ontario)")], 1, 1)])
    [p] = gcjobs.scrape(SEARCH_URL, fetcher(external=None), browser)
    assert (p["title"], p["organization"], p["location_text"]) == (
        "Junior Developer", "Canada Mortgage and Housing Corporation", "Ottawa (Ontario)")
    assert p["description"] is None and p["closes_at"] == "2026-11-20"


def test_withdrawn_poster_is_skipped_not_fatal():
    browser = FakeBrowser([results_page([result(1, "Manager", "TC"), result(404, "Gone", "X")], 1, 1)])
    assert [p["title"] for p in gcjobs.scrape(SEARCH_URL, fetcher(), browser)] == ["Manager, Marine Safety"]


def test_single_poster_needs_no_browser():
    [p] = gcjobs.scrape("https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant/page1800?poster=1", fetcher())
    assert p["title"] == "Manager, Marine Safety"


def test_search_in_http_pool_escalates_to_browser():
    with pytest.raises(pipeline.Escalate):
        pipeline.scrape(SEARCH_URL, "careers_page", "http", fetcher())


def test_parse_results_reads_page_count():
    rows, pages = gcjobs.parse_results(results_page([result(7, "A", "Org - Branch", "Fredericton (New Brunswick)")], 1, 4))
    assert pages == 4
    assert rows == [{"poster": "7", "link": gcjobs.BASE + "page1800?poster=7", "title": "A",
                     "closes": "2026-11-20", "organization": "Org - Branch",
                     "location": "Fredericton (New Brunswick)"}]
    assert json.dumps(rows)  # plain data, safe to store in raw


def test_older_poster_layout_uses_row_fields_and_page_body():
    browser = FakeBrowser([results_page([result(5, "Stock Assessment Technician",
                                                "Fisheries and Oceans Canada - Fraser Interior Area")], 1, 1)])
    [p] = gcjobs.scrape(SEARCH_URL, fetcher(), browser)
    assert p["organization"] == "Fisheries and Oceans Canada"
    assert p["location_text"] == "Various Locations, including Fredericton (New Brunswick)"
    assert "Count fish." in p["description"] and "Reference number" not in p["description"]


def test_links_to_other_site_sections_keep_the_row():
    item = result(1, "ONGOING STUDENT RECRUITMENT", "Public Service Commission").replace(
        "/psrs-srfp/applicant/page1800?poster=1", "/srs-sre/page01.html?poster=1&amp;lang=en")
    [p] = gcjobs.scrape(SEARCH_URL, fetcher(), FakeBrowser([results_page([item], 1, 1)]))
    assert p["title"] == "ONGOING STUDENT RECRUITMENT"
    assert p["url"] == "https://emploisfp-psjobs.cfp-psc.gc.ca/srs-sre/page01.html?poster=1&lang=en"
