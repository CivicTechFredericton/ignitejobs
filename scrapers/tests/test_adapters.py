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
