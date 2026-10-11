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
    ],
)
def test_detect(url, name, pool, scrapable):
    platform = detect(url)
    assert (platform.name, platform.pool, platform.scrapable) == (name, pool, scrapable)


def test_indeed_canonical_url_drops_tracking():
    url = "https://ca.indeed.com/viewjob?jk=abc123&from=shareddesktop_copy#x"
    assert canonical_url(url) == "https://ca.indeed.com/viewjob?jk=abc123"
