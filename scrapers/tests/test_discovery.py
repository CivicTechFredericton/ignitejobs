from ignite_scrapers.strategies.discovery import job_links

HTML = """
<a href="/opportunities/">All</a>
<a href="/opportunities/controller-halifax/">Controller</a>
<a href="https://venor.ca/opportunities/controller-halifax/#apply">Controller again</a>
<a href="/opportunities/brochure.pdf">PDF</a>
<a href="https://elsewhere.com/jobs/1">Other site</a>
<a href="/about-us">About</a>
"""


def test_finds_same_site_posting_links_once():
    links = job_links(HTML, "https://venor.ca/practices/sales-marketing-recruitment/")
    assert links == ["https://venor.ca/opportunities/controller-halifax/"]


def test_careerbeacon_links_are_canonicalised():
    html = '<a href="/details/adjunct-faculty/2241831">Adjunct</a>'
    links = job_links(html, "https://jobs.careerbeacon.com/employer-profile/university-of-fredericton")
    assert links == ["https://www.careerbeacon.com/en/job/2241831"]
