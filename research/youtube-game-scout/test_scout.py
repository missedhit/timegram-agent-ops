"""Offline tests for scout.py using a fake YouTube API. Run: python3 -m unittest test_scout.py"""

import datetime as dt
import tempfile
import unittest
from pathlib import Path

import scout

NOW = dt.datetime(2026, 9, 28, tzinfo=dt.timezone.utc)


def iso(days_ago: float) -> str:
    return (NOW - dt.timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def fake_api(videos: list[dict], channels: dict[str, int]):
    """videos: dicts with id, title, ch, days_ago, views, dur, lang."""
    calls = []

    def fetch(endpoint: str, params: dict) -> dict:
        calls.append(endpoint)
        if endpoint == "search":
            return {"items": [{"id": {"videoId": v["id"]}, "snippet": {"title": v["title"]}} for v in videos]}
        if endpoint == "videos":
            wanted = params["id"].split(",")
            return {"items": [{
                "id": v["id"],
                "snippet": {"title": v["title"], "channelId": v["ch"], "channelTitle": v["ch"].upper(),
                            "publishedAt": iso(v["days_ago"]), "defaultAudioLanguage": v.get("lang", "en")},
                "statistics": {"viewCount": str(v["views"])},
                "contentDetails": {"duration": v.get("dur", "PT20M")},
            } for v in videos if v["id"] in wanted]}
        if endpoint == "channels":
            return {"items": [{"id": c, "statistics": {"subscriberCount": str(channels[c])}}
                              for c in params["id"].split(",") if c in channels]}
        raise AssertionError(endpoint)

    return fetch, calls


class HelpersTest(unittest.TestCase):
    def test_duration(self):
        self.assertEqual(scout.iso_duration_seconds("PT1H2M3S"), 3723)
        self.assertEqual(scout.iso_duration_seconds("PT45S"), 45)
        self.assertEqual(scout.iso_duration_seconds("P1DT1S"), 86401)
        self.assertEqual(scout.iso_duration_seconds("garbage"), 0)

    def test_default_pattern_requires_all_words_any_order(self):
        import re
        pat = re.compile(scout.default_pattern("Black Flag Resynced"), re.I)
        self.assertTrue(pat.search("RESYNCED Black Flag 100% guide"))
        self.assertFalse(pat.search("Black Flag original 2013"))

    def test_load_games_formats(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "g.txt"
            p.write_text("# c\n\nValheim\nGTA 6 | GTA 6 | gta (6|vi)\n")
            games = scout.load_games(p)
        self.assertEqual(games[0][:2], ("Valheim", "Valheim"))
        self.assertEqual(games[1], ("GTA 6", "GTA 6", "gta (6|vi)"))

    def test_percentile_ranks_ties(self):
        self.assertEqual(scout.percentile_ranks([1, 2, 2, 3]), [0.0, 0.5, 0.5, 1.0])
        self.assertEqual(scout.percentile_ranks([5]), [0.5])


class ScanTest(unittest.TestCase):
    def scan(self, videos, channels, name="Valheim"):
        fetch, calls = fake_api(videos, channels)
        r, vids = scout.scan_game(fetch, name, name, scout.default_pattern(name), days=30,
                                  region="US", lang="en", small_cap=100_000, now=NOW)
        return r, vids, calls

    def test_metrics(self):
        videos = [
            # small channel (5K subs) with 200K views: a small-channel win
            {"id": "a", "title": "Valheim 1.0 beginner guide", "ch": "small", "days_ago": 2, "views": 200_000},
            # big channel dominates
            {"id": "b", "title": "Valheim is back", "ch": "big", "days_ago": 20, "views": 1_000_000},
            {"id": "c", "title": "Valheim deep north", "ch": "big", "days_ago": 15, "views": 500_000},
            # a Short in another language
            {"id": "d", "title": "Valheim #shorts", "ch": "mid", "days_ago": 10, "views": 300_000,
             "dur": "PT30S", "lang": "pt"},
            # off-topic result that must be filtered out by the title regex
            {"id": "e", "title": "Minecraft hardcore", "ch": "big", "days_ago": 1, "views": 9_000_000},
        ]
        r, vids, calls = self.scan(videos, {"small": 5_000, "big": 2_000_000, "mid": 400_000})
        self.assertEqual(calls, ["search", "videos", "channels"])
        self.assertEqual(r.videos, 4)
        self.assertEqual(r.total_views, 2_000_000)
        self.assertAlmostEqual(r.small_win_rate, 0.25)
        self.assertIn("5,000 subs", r.best_small_video)
        self.assertAlmostEqual(r.top3_share, 1.0)
        self.assertAlmostEqual(r.shorts_view_share, 0.15)
        self.assertAlmostEqual(r.english_share, 0.85)
        # fresh (2 days, 100K/day) vs older median vpd -> momentum well above 1
        self.assertGreater(r.momentum, 1.0)
        # long-form excludes the 30s Short; only the small channel's video is a long-form small win
        self.assertEqual(r.lf_videos, 3)
        self.assertEqual(r.lf_small_wins, 1)
        self.assertIn("5,000 subs", r.best_small_longform)

    def test_hidden_subscribers_never_count_as_small(self):
        videos = [{"id": "a", "title": "Valheim run", "ch": "hid", "days_ago": 3, "views": 50_000}]

        def fetch(endpoint, params):
            if endpoint == "channels":
                return {"items": [{"id": "hid", "statistics": {"hiddenSubscriberCount": True}}]}
            return fake_api(videos, {})[0](endpoint, params)

        r, _ = scout.scan_game(fetch, "Valheim", "Valheim", scout.default_pattern("Valheim"), days=30,
                               region="US", lang="en", small_cap=100_000, now=NOW)
        self.assertEqual(r.small_win_rate, 0.0)

    def test_no_matches(self):
        r, vids, calls = self.scan([{"id": "x", "title": "unrelated", "ch": "c", "days_ago": 1, "views": 1}], {})
        self.assertEqual(r.videos, 0)
        self.assertEqual(calls, ["search"])
        self.assertIn("no matching uploads in window", r.notes)

    def test_score_orders_open_growing_games_first(self):
        hot = scout.GameResult("hot", videos=20, median_vpd=5000, momentum=2.0, small_win_rate=0.4,
                               top3_share=0.3, english_share=0.9)
        locked = scout.GameResult("locked", videos=20, median_vpd=8000, momentum=0.6, small_win_rate=0.0,
                                  top3_share=0.9, english_share=0.5)
        empty = scout.GameResult("empty")
        scout.score([hot, locked, empty])
        self.assertGreater(hot.score, locked.score)
        self.assertEqual(empty.score, 0.0)

    def test_write_outputs(self):
        r = scout.GameResult("Valheim", videos=3, total_views=10, median_vpd=1.0, score=50.0,
                             best_small_video="x", notes=["thin sample (3 videos)"])
        with tempfile.TemporaryDirectory() as d:
            md = scout.write_outputs([r], Path(d), days=30, quota_used=102)
            text = md.read_text()
            self.assertIn("| 1 | Valheim | 50.0 |", text)
            self.assertIn("## Long-form only", text)
            self.assertIn("| Valheim | 0 | 0 | 0 |", text)
            self.assertTrue(list(Path(d).glob("*.csv")))


class DumpTest(unittest.TestCase):
    def test_from_dump_roundtrip_needs_no_key(self):
        import json, os
        v = scout.Video("a", "Valheim guide", "c", "C", NOW - dt.timedelta(days=3), 5000, 900, "en", 1000)
        row = {**scout.asdict(v), "published": v.published.isoformat()}
        with tempfile.TemporaryDirectory() as d:
            dump = Path(d) / "videos.json"
            dump.write_text(json.dumps({"Valheim": [row]}))
            os.environ.pop("YOUTUBE_API_KEY", None)
            self.assertEqual(scout.main(["--from-dump", str(dump), "--out", d]), 0)
            text = next(Path(d).glob("scout-*.md")).read_text()
        self.assertIn("| Valheim | 1 |", text)


class CacheKeyTest(unittest.TestCase):
    def test_search_window_is_day_aligned(self):
        seen = []

        def fetch(endpoint, params):
            seen.append(params.get("publishedAfter"))
            return {"items": []}

        for minute in (1, 59):
            scout.scan_game(fetch, "X", "X", "x", days=30, region="US", lang="en", small_cap=1,
                            now=NOW.replace(hour=5, minute=minute))
        self.assertEqual(seen, ["2026-08-29T00:00:00Z"] * 2)


if __name__ == "__main__":
    unittest.main()
