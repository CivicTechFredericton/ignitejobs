"""Adapters against canned API responses (shapes captured from the live APIs, Nov 2026)."""

import json

import httpx
import pytest

from ignite_scrapers import adapters
from ignite_scrapers.fetch import Fetcher, NotFound, Pacer


class NoWait(Pacer):
    def wait(self, url):
        pass


def fetcher(routes: dict[str, object]) -> Fetcher:
    """routes maps 'METHOD path' (or 'METHOD path?query') to a JSON body or a status code."""

    def handler(request: httpx.Request) -> httpx.Response:
        for key in (f"{request.method} {request.url.path}?{request.url.query.decode()}",
                    f"{request.method} {request.url.path}"):
            if key in routes:
                body = routes[key]
                if isinstance(body, int):
                    return httpx.Response(body)
                return httpx.Response(200, json=body)
        raise AssertionError(f"unexpected request {request.method} {request.url}")

    return Fetcher(httpx.Client(transport=httpx.MockTransport(handler)), NoWait())


def test_bamboohr_careers_page():
    job = {
        "jobOpeningName": "Senior Mechanical Designer",
        "location": {"city": "Fredericton", "state": "New Brunswick"},
        "description": "<p>Design things</p>",
        "datePosted": "2026-09-22",
    }
    fetch = fetcher({
        "GET /careers/list": {"result": [{"id": "96"}]},
        "GET /careers/96/detail": {"result": {"jobOpening": job}},
        "GET /careers/company-info": {"result": {"name": "Smart Skin"}},
    })
    [p] = adapters.get("bamboohr")("https://smartskin.bamboohr.com/careers?source=LinkedIn", fetch)
    assert p["title"] == "Senior Mechanical Designer"
    assert p["url"] == "https://smartskin.bamboohr.com/careers/96"
    assert p["location_text"] == "Fredericton, New Brunswick"
    assert p["organization"] == "Smart Skin"


def test_bamboohr_single_posting_ignores_tracking():
    fetch = fetcher({
        "GET /careers/354/detail": {"result": {"jobOpening": {"jobOpeningName": "X"}}},
        "GET /careers/company-info": 404,
    })
    [p] = adapters.get("bamboohr")("https://gemtec.bamboohr.com/careers/354?source=aWQ9MTk%3D", fetch)
    assert p["url"] == "https://gemtec.bamboohr.com/careers/354"


def test_greenhouse_unescapes_content_and_uses_board_name():
    fetch = fetcher({
        "GET /v1/boards/colab": {"name": "CoLab Software"},
        "GET /v1/boards/colab/jobs": {"jobs": [{
            "title": "Engineer", "absolute_url": "https://job-boards.greenhouse.io/colab/jobs/1",
            "location": {"name": "Fredericton, NB"}, "content": "&lt;p&gt;Hi&lt;/p&gt;",
            "first_published": "2026-10-19T17:13:32-04:00",
        }]},
    })
    [p] = adapters.get("greenhouse")("https://job-boards.greenhouse.io/colab", fetch)
    assert (p["organization"], p["description"]) == ("CoLab Software", "<p>Hi</p>")


def test_greenhouse_closed_posting_is_not_found():
    fetch = fetcher({"GET /v1/boards/colab/jobs/9": 404})
    with pytest.raises(NotFound):
        adapters.get("greenhouse")("https://job-boards.greenhouse.io/colab/jobs/9", fetch)


def test_smartrecruiters_posting():
    fetch = fetcher({"GET /v1/companies/EMCOCorporation/postings/744000146789829": {
        "id": "744000146789829", "name": "Trainee",
        "company": {"name": "EMCO Corporation", "identifier": "EMCOCorporation"},
        "location": {"fullLocation": "Fredericton, NB, Canada", "remote": False},
        "jobAd": {"sections": {"jobDescription": {"title": "Job Description", "text": "<p>Learn</p>"}}},
        "releasedDate": "2026-09-01T18:00:24.701Z", "language": {"code": "en"},
        "postingUrl": "https://jobs.smartrecruiters.com/EMCOCorporation/744000146789829-trainee",
    }})
    url = "https://jobs.smartrecruiters.com/EMCOCorporation/744000146789829-trainee?trid=abc"
    [p] = adapters.get("smartrecruiters")(url, fetch)
    assert p["organization"] == "EMCO Corporation"
    assert p["description"] == "<h3>Job Description</h3><p>Learn</p>"
    assert p["language"] == "en"


def test_workday_careers_page_passes_facets():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"total": 1, "jobPostings": [
                {"externalPath": "/job/New-Brunswick/Analyst_R-1"}]})
        assert request.url.path == "/wday/cxs/medaviehs/Medavie_External/job/New-Brunswick/Analyst_R-1"
        return httpx.Response(200, json={
            "jobPostingInfo": {"title": "Analyst", "location": "New Brunswick",
                               "startDate": "2026-11-18", "endDate": "2026-11-30"},
            "hiringOrganization": {"name": "Medavie Inc."},
        })

    fetch = Fetcher(httpx.Client(transport=httpx.MockTransport(handler)), NoWait())
    url = "https://medaviehs.wd10.myworkdayjobs.com/en-US/Medavie_External?locations=abc"
    [p] = adapters.get("workday")(url, fetch)
    assert seen["body"]["appliedFacets"] == {"locations": ["abc"]}
    assert p["url"] == (
        "https://medaviehs.wd10.myworkdayjobs.com/en-US/Medavie_External/job/New-Brunswick/Analyst_R-1"
    )
    assert (p["organization"], p["closes_at"]) == ("Medavie Inc.", "2026-11-30")


def test_oracle_posting():
    fetch = fetcher({
        "GET /hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails": {"items": [{
            "Title": "Field Technician", "PrimaryLocation": "Fredericton, NB, Canada",
            "ExternalDescriptionStr": "<p>Dig</p>", "ContentLocale": "en",
            "ExternalPostedStartDate": "2026-08-20T19:36:01+00:00",
        }]},
    })
    url = "https://ejov.fa.ca2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/28293/?utm_medium=x"
    [p] = adapters.get("oracle_hcm")(url, fetch)
    assert p["title"] == "Field Technician"
    assert p["url"] == "https://ejov.fa.ca2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/28293"


def test_oracle_unposted_requisition_is_not_found():
    fetch = fetcher({"GET /hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails": {"items": []}})
    url = "https://ejov.fa.ca2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/1"
    with pytest.raises(NotFound):
        adapters.get("oracle_hcm")(url, fetch)


def test_workday_403_on_a_posting_means_closed_when_board_answers():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json={"total": 0, "jobPostings": []})
        return httpx.Response(403, json={"errorCode": "S22", "message": "permission denied"})

    fetch = Fetcher(httpx.Client(transport=httpx.MockTransport(handler)), NoWait())
    url = "https://bestbuycanada.wd3.myworkdayjobs.com/en-US/bestbuyca_career/job/X/Y_R-1"
    with pytest.raises(NotFound):
        adapters.get("workday")(url, fetch)


# UltiPro pages embed their data in inline scripts; these mimic that markup (Nov 2026).
ULTIPRO_BOARD = "https://recruiting.ultipro.ca/STE5002SAGL/JobBoard/e2794117-8328-4f04-89e6-81160179438f"


def ultipro_page(**scripts: object) -> str:
    lines = [f"{marker}{json.dumps(value)}," for marker, value in scripts.items()]
    return "<html><script>var vm = new US.Opportunity.OpportunitiesViewModel({\n" + "\n".join(lines) + "\n});</script></html>"


def ultipro_detail(job: dict) -> str:
    return f"<script>var o = new US.Opportunity.CandidateOpportunityDetail({json.dumps(job)});</script>"


def ultipro_job(id_: str, title: str, city: str, closed: bool = False) -> dict:
    return {
        "Id": id_, "Title": title, "Description": "<p>Detail cars</p>", "PostedDate": "2026-11-02T20:48:15Z",
        "OpportunityIsClosed": closed,
        "Locations": [{"LocalizedName": None, "Address": {"City": city, "State": {"Name": "New Brunswick"}}}],
    }


def ultipro_fetcher(jobs: dict[str, str], searches: list[dict]) -> Fetcher:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "POST" and path.endswith("/JobBoardView/LoadSearchResults"):
            body = json.loads(request.content)["opportunitySearch"]
            searches.append(body)
            ids = list(jobs)[body["Skip"]:body["Skip"] + body["Top"]]
            return httpx.Response(200, json={"opportunities": [{"Id": i} for i in ids], "totalCount": len(jobs)})
        if path.endswith("/OpportunityDetail"):
            html = jobs.get(request.url.params["opportunityId"], "<html>no opportunity</html>")
            return httpx.Response(200, text=html)
        if path.endswith("/e2794117-8328-4f04-89e6-81160179438f/"):
            return httpx.Response(200, text=ultipro_page(**{"jobBoard: ": {"Name": "Steele Auto Group Careers"}}))
        raise AssertionError(f"unexpected request {request.method} {request.url}")

    return Fetcher(httpx.Client(transport=httpx.MockTransport(handler)), NoWait())


def test_ultipro_search_keeps_query_and_sort_order():
    searches: list[dict] = []
    jobs = {"a": ultipro_detail(ultipro_job("a", "Detailer", "Fredericton")),
            "b": ultipro_detail(ultipro_job("b", "Sales Representative", "Fredericton"))}
    fetch = ultipro_fetcher(jobs, searches)
    found = adapters.get("ultipro")(f"{ULTIPRO_BOARD}/?q=fredericton&o=relevance", fetch)
    assert searches[0]["QueryString"] == "fredericton"
    assert searches[0]["OrderBy"] == [{"Value": "relevance", "PropertyName": "MatchScore", "Ascending": False}]
    assert [p["title"] for p in found] == ["Detailer", "Sales Representative"]
    p = found[0]
    assert p["url"] == f"{ULTIPRO_BOARD}/OpportunityDetail?opportunityId=a"
    assert (p["organization"], p["location_text"]) == ("Steele Auto Group", "Fredericton, New Brunswick")
    assert p["description"] == "<p>Detail cars</p>"
    assert "Description" not in p["raw"]


def test_ultipro_search_without_text_sorts_by_date():
    searches: list[dict] = []
    adapters.get("ultipro")(f"{ULTIPRO_BOARD}/", ultipro_fetcher({}, searches))
    assert searches[0]["QueryString"] == ""
    assert searches[0]["OrderBy"][0]["PropertyName"] == "PostedDate"


def test_ultipro_single_posting():
    jobs = {"x": ultipro_detail(ultipro_job("x", "Detailer", "Fredericton"))}
    [p] = adapters.get("ultipro")(f"{ULTIPRO_BOARD}/OpportunityDetail?opportunityId=x", ultipro_fetcher(jobs, []))
    assert (p["title"], p["organization"]) == ("Detailer", "Steele Auto Group")


@pytest.mark.parametrize("jobs", [{}, {"x": ultipro_detail(ultipro_job("x", "Detailer", "Fredericton", closed=True))}])
def test_ultipro_missing_or_closed_posting_is_not_found(jobs):
    with pytest.raises(NotFound):
        adapters.get("ultipro")(f"{ULTIPRO_BOARD}/OpportunityDetail?opportunityId=x", ultipro_fetcher(jobs, []))
