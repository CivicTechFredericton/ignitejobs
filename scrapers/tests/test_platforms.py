import pytest

from ignite_scrapers.platforms import canonical_url, detect


@pytest.mark.parametrize(
    ("url", "name", "pool", "scrapable"),
    [
        ("https://www.linkedin.com/jobs/view/123", "linkedin", "http", False),
        ("https://lnkd.in/abc", "linkedin", "http", False),
        ("https://ca.indeed.com/viewjob?jk=abc", "indeed", "browser", True),
        ("https://gemtec.bamboohr.com/careers/12", "bamboohr", "http", True),
        ("https://medaviehs.wd10.myworkdayjobs.com/x", "workday", "http", True),
        ("https://www.careerbeacon.com/en/job/1", "careerbeacon", "browser", True),
        ("https://careers.nbpower.com/job/1", "generic", "http", True),
        (("https://www.careers.nbpower.com/psc/prod/EMPLOYEE/HRMS/c/"
          "HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL?Page=HRS_APP_SCHJOB_FL&Action=U&"),
         "peoplesoft", "http", True),
        ("https://ejov.fa.ca2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/1",
         "oracle_hcm", "http", True),
    ],
)
def test_detect(url, name, pool, scrapable):
    platform = detect(url)
    assert (platform.name, platform.pool, platform.scrapable) == (name, pool, scrapable)


def test_indeed_canonical_url_drops_tracking():
    url = "https://ca.indeed.com/viewjob?jk=abc123&from=shareddesktop_copy#x"
    assert canonical_url(url) == "https://ca.indeed.com/viewjob?jk=abc123"


def test_careerbeacon_canonical_url():
    assert canonical_url(
        "https://jobs.careerbeacon.com/details/head-law-librarian/2239753?utm_source=x"
    ) == "https://www.careerbeacon.com/en/job/2239753"
    assert canonical_url(
        "https://www.careerbeacon.com/en/job-9/3866468/showcase/sales/fredericton-nb?utm_source=x"
    ) == "https://www.careerbeacon.com/en/job-9/3866468"
