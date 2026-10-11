from ignite_scrapers.strategies.json_ld import job_postings, to_posting

HTML = """
<html><head><script type="application/ld+json">
{"@context": "https://schema.org", "@graph": [
  {"@type": "Organization", "name": "Acme"},
  {"@type": "JobPosting", "title": "Event Manager",
   "hiringOrganization": {"@type": "Organization", "name": "ACADA"},
   "jobLocation": {"@type": "Place", "address": {"addressLocality": "Fredericton", "addressRegion": "NB"}},
   "datePosted": "2026-09-20", "validThrough": "2026-10-20"}
]}
</script></head><body></body></html>
"""


def test_extracts_job_posting_from_graph():
    [node] = job_postings(HTML, "https://example.org/jobs/1")
    posting = to_posting(node, "https://example.org/jobs/1")
    assert posting["title"] == "Event Manager"
    assert posting["organization"] == "ACADA"
    assert posting["location_text"] == "Fredericton"
    assert posting["url"] == "https://example.org/jobs/1"
