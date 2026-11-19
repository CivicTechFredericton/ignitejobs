from ignite_scrapers.store import _timestamp


def test_timestamp_accepts_iso_and_drops_junk():
    assert _timestamp("2026-11-30") == "2026-11-30T00:00:00"
    assert _timestamp("2026-09-01T18:00:24.701Z") == "2026-09-01T18:00:24.701000+00:00"
    assert _timestamp("Sat Nov 07 02:00:00 UTC 2026") == "2026-11-07T02:00:00"
    assert _timestamp("Posted Yesterday") is None
    assert _timestamp(None) is None
