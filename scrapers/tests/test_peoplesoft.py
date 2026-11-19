"""PeopleSoft Candidate Gateway against trimmed copies of NB Power's pages (Nov 2026)."""

from urllib.parse import parse_qs

import httpx
import pytest

from ignite_scrapers import adapters
from ignite_scrapers.fetch import Fetcher, NotFound, Pacer

BASE = "https://www.careers.nbpower.com/psc/prod/EMPLOYEE/HRMS/c/HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL"

HOME = f"""<html lang="en"><body><form name="win0" method="post" action="{BASE}">
<input type="hidden" name="ICSID" value="abc"><input type="hidden" name="ICAction" value="None">
<a id="NAV_PB$0" href="javascript:submitAction_win0(document.win0,'NAV_PB$0');">View All Jobs</a>
</form></body></html>"""

RESULTS = """<html><body><ul>
<li id="HRS_AGNT_RSLT_I$0_row_0"><span id="SCH_JOB_TITLE$0">Engineer I-IV</span>
<span id="HRS_APP_JBSCH_I_HRS_JOB_OPENING_ID$0">22712</span><span id="LOCATION$0">Belledune Plant</span>
<span id="HRS_APP_JBSCH_I_HRS_DEPT_DESCR$0">EPMO (Construction)</span>
<span id="SCH_OPENED$0">2026/11/17</span><span id="HRS_CLS_DT_DESCR$0">2026/11/30</span></li>
</ul></body></html>"""

DETAIL = """<html lang="en"><body>
<span id="HRS_SCH_WRK2_POSTING_TITLE">Engineer I-IV</span>
<span id="HRS_SCH_WRK_HRS_DESCRLONG">Belledune Plant</span>
<span id="HRS_SCH_WRK_HRS_FULL_PART_TIME">Full-Time</span>
<span class="ps_box-value" id="HRS_SCH_PSTDSC_DESCRLONG$0"><p><strong>Four-year term</strong></p></span>
</body></html>"""

LOGIN = "<html><body>You must have cookies enabled in order to sign in.</body></html>"


class NoWait(Pacer):
    def wait(self, url):
        pass


def make_fetcher(public_sites=("2",), seen=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            form = parse_qs(request.content.decode())
            assert form["ICAction"] == ["NAV_PB$0"] and form["ICSID"] == ["abc"]
            return httpx.Response(200, html=RESULTS)
        query = dict(request.url.params)
        if seen is not None:
            seen.append(query)
        if query.get("SiteId") not in public_sites:
            return httpx.Response(200, html=LOGIN)
        if query.get("Page") == "HRS_APP_JBPST_FL":
            return httpx.Response(200, html=DETAIL if query["JobOpeningId"] == "22712" else "<html></html>")
        return httpx.Response(200, html=HOME)

    return Fetcher(httpx.Client(transport=httpx.MockTransport(handler)), NoWait())


def test_lists_all_jobs_and_reads_each_posting():
    url = f"{BASE}?Page=HRS_APP_SCHJOB_FL&Action=U&"  # as pasted: no SiteId
    [p] = adapters.get("peoplesoft")(url, make_fetcher())
    assert p["title"] == "Engineer I-IV"
    assert p["location_text"] == "Belledune Plant"
    assert (p["posted_at"], p["closes_at"]) == ("2026-11-17", "2026-11-30")
    assert p["description"] == "<p><strong>Four-year term</strong></p>"
    assert "JobOpeningId=22712" in p["url"] and "SiteId=2" in p["url"]
    assert p["raw"]["department"] == "EPMO (Construction)"


def test_finds_the_public_site_when_siteid_is_missing():
    seen = []
    adapters.get("peoplesoft")(f"{BASE}?Page=HRS_APP_SCHJOB_FL", make_fetcher(public_sites=("1",), seen=seen))
    assert [q["SiteId"] for q in seen][:2] == ["2", "1"]


def test_single_posting_link():
    url = f"{BASE}?Page=HRS_APP_JBPST_FL&Action=U&FOCUS=Applicant&SiteId=2&JobOpeningId=22712&PostingSeq=1"
    [p] = adapters.get("peoplesoft")(url, make_fetcher())
    assert p["title"] == "Engineer I-IV" and p["closes_at"] is None


def test_unposted_job_is_not_found():
    url = f"{BASE}?Page=HRS_APP_JBPST_FL&SiteId=2&JobOpeningId=99999"
    with pytest.raises(NotFound):
        adapters.get("peoplesoft")(url, make_fetcher())


def test_no_public_site_is_not_found():
    with pytest.raises(NotFound):
        adapters.get("peoplesoft")(f"{BASE}?Page=HRS_APP_SCHJOB_FL", make_fetcher(public_sites=()))
