#!/usr/bin/env python3
"""YouTube game scout: rank games by recent YouTube demand vs. how beatable the competition is.

Reads a list of games, pulls the most-viewed videos uploaded in the last N days for each game
from the YouTube Data API v3, and scores every game on primary YouTube data (not articles):

  demand       views on recent uploads, age-normalised (views per day since upload)
  momentum     are uploads from the last 7 days pulling more views/day than days 8..N?
  small wins   share of top videos made by channels under the size cap that out-performed
               their own subscriber count (proof a small channel can rank for this game)
  concentration share of views captured by the top 3 channels (low = not locked up)
  english share share of views on English-audio videos (a proxy for higher ad RPM)

Stdlib only. Needs YOUTUBE_API_KEY in the environment (free key from Google Cloud Console).
Quota: ~102 units per game (search.list = 100, videos.list + channels.list = 1 each per 50 ids).
The default free quota is 10,000 units/day, so ~95 games per day. Responses are cached on disk,
so re-running the same day costs nothing.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import re
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Callable

API = "https://www.googleapis.com/youtube/v3/"
QUOTA_COST = {"search": 100, "videos": 1, "channels": 1}
SHORT_MAX_SECONDS = 180

HERE = Path(__file__).resolve().parent


# ---------------------------------------------------------------------------
# API access (cached)
# ---------------------------------------------------------------------------

class QuotaTracker:
    def __init__(self) -> None:
        self.used = 0

    def charge(self, endpoint: str) -> None:
        self.used += QUOTA_COST[endpoint]


Fetcher = Callable[[str, dict], dict]


def make_fetcher(api_key: str, cache_dir: Path, quota: QuotaTracker) -> Fetcher:
    """Return fetch(endpoint, params) that caches responses for the current UTC day."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")

    def fetch(endpoint: str, params: dict) -> dict:
        key_src = json.dumps([today, endpoint, sorted(params.items())])
        cache_file = cache_dir / (hashlib.sha1(key_src.encode()).hexdigest() + ".json")
        if cache_file.exists():
            return json.loads(cache_file.read_text())
        query = urllib.parse.urlencode({**params, "key": api_key})
        try:
            with urllib.request.urlopen(API + endpoint + "?" + query, timeout=30) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise SystemExit(f"YouTube API error {e.code} on {endpoint}: {body[:500]}")
        quota.charge(endpoint)
        cache_file.write_text(json.dumps(data))
        return data

    return fetch


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

_DURATION = re.compile(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


def iso_duration_seconds(value: str) -> int:
    m = _DURATION.fullmatch(value or "")
    if not m:
        return 0
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def parse_time(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_games(path: Path) -> list[tuple[str, str, str]]:
    """Each non-comment line: `Name` or `Name | search query | title regex`.

    Only the first two `|` separate fields, so the regex itself may use `|` for alternation.
    """
    games = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|", 2)]
        name = parts[0]
        query = parts[1] if len(parts) > 1 and parts[1] else name
        pattern = parts[2] if len(parts) > 2 and parts[2] else default_pattern(name)
        games.append((name, query, pattern))
    return games


def default_pattern(name: str) -> str:
    """Title must contain every significant word of the game name (in any order)."""
    words = [w for w in re.findall(r"[\w']+", name.lower()) if len(w) > 2 or w.isdigit()]
    return "".join(f"(?=.*\\b{re.escape(w)}\\b)" for w in words) or re.escape(name.lower())


# ---------------------------------------------------------------------------
# Core scan
# ---------------------------------------------------------------------------

@dataclass
class Video:
    id: str
    title: str
    channel_id: str
    channel_title: str
    published: dt.datetime
    views: int
    seconds: int
    audio_lang: str
    channel_subs: int = 0

    @property
    def is_short(self) -> bool:
        return 0 < self.seconds <= SHORT_MAX_SECONDS

    def views_per_day(self, now: dt.datetime) -> float:
        age_days = max((now - self.published).total_seconds() / 86400, 0.5)
        return self.views / age_days


@dataclass
class GameResult:
    game: str
    videos: int = 0
    total_views: int = 0
    median_vpd: float = 0.0
    momentum: float = 0.0
    small_win_rate: float = 0.0
    top3_share: float = 0.0
    shorts_view_share: float = 0.0
    english_share: float = 0.0
    best_small_video: str = ""
    score: float = 0.0
    notes: list[str] = field(default_factory=list)


def scan_game(fetch: Fetcher, name: str, query: str, pattern: str, *, days: int,
              region: str, lang: str, small_cap: int, now: dt.datetime) -> tuple[GameResult, list[Video]]:
    after = (now - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    search = fetch("search", {
        "part": "snippet", "type": "video", "q": query, "order": "viewCount",
        "publishedAfter": after, "maxResults": 50, "regionCode": region,
        "relevanceLanguage": lang,
    })
    title_re = re.compile(pattern, re.IGNORECASE)
    ids = [it["id"]["videoId"] for it in search.get("items", [])
           if title_re.search(it["snippet"]["title"])]
    result = GameResult(game=name)
    if not ids:
        result.notes.append("no matching uploads in window")
        return result, []

    vids = fetch("videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(ids)})
    videos = []
    for it in vids.get("items", []):
        sn, st = it["snippet"], it.get("statistics", {})
        videos.append(Video(
            id=it["id"], title=sn["title"], channel_id=sn["channelId"],
            channel_title=sn.get("channelTitle", ""), published=parse_time(sn["publishedAt"]),
            views=int(st.get("viewCount", 0)),
            seconds=iso_duration_seconds(it.get("contentDetails", {}).get("duration", "")),
            audio_lang=(sn.get("defaultAudioLanguage") or sn.get("defaultLanguage") or "").lower(),
        ))

    channel_ids = sorted({v.channel_id for v in videos})
    subs: dict[str, int] = {}
    for i in range(0, len(channel_ids), 50):
        ch = fetch("channels", {"part": "statistics", "id": ",".join(channel_ids[i:i + 50])})
        for it in ch.get("items", []):
            st = it.get("statistics", {})
            # Hidden subscriber counts are treated as "large" so they never count as small wins.
            subs[it["id"]] = int(st["subscriberCount"]) if not st.get("hiddenSubscriberCount") else 10**9
    for v in videos:
        v.channel_subs = subs.get(v.channel_id, 10**9)

    return summarise(result, videos, now=now, small_cap=small_cap, days=days), videos


def summarise(result: GameResult, videos: list[Video], *, now: dt.datetime,
              small_cap: int, days: int) -> GameResult:
    result.videos = len(videos)
    if not videos:
        return result
    total = sum(v.views for v in videos) or 1
    result.total_views = total
    vpds = [v.views_per_day(now) for v in videos]
    result.median_vpd = statistics.median(vpds)

    week_ago = now - dt.timedelta(days=7)
    fresh = [v.views_per_day(now) for v in videos if v.published >= week_ago]
    older = [v.views_per_day(now) for v in videos if v.published < week_ago]
    if fresh and older:
        result.momentum = statistics.median(fresh) / max(statistics.median(older), 1.0)
    elif fresh:
        result.momentum = 2.0
        result.notes.append("all top uploads are from the last 7 days")
    else:
        result.notes.append("no top uploads in the last 7 days")

    small_wins = [v for v in videos if v.channel_subs < small_cap and v.views >= max(v.channel_subs, 1)]
    result.small_win_rate = len(small_wins) / len(videos)
    if small_wins:
        best = max(small_wins, key=lambda v: v.views)
        result.best_small_video = (f"{best.views:,} views / {best.channel_subs:,} subs: "
                                   f"{best.channel_title} - https://youtu.be/{best.id}")

    by_channel: dict[str, int] = {}
    for v in videos:
        by_channel[v.channel_id] = by_channel.get(v.channel_id, 0) + v.views
    result.top3_share = sum(sorted(by_channel.values(), reverse=True)[:3]) / total
    result.shorts_view_share = sum(v.views for v in videos if v.is_short) / total
    tagged = [v for v in videos if v.audio_lang]
    if tagged:
        result.english_share = (sum(v.views for v in tagged if v.audio_lang.startswith("en"))
                                / (sum(v.views for v in tagged) or 1))
    else:
        result.notes.append("no audio-language tags")
    if len(videos) < 10:
        result.notes.append(f"thin sample ({len(videos)} videos)")
    return result


def percentile_ranks(values: list[float]) -> list[float]:
    """0..1 rank of each value within the list (ties share the mean rank)."""
    if len(values) <= 1:
        return [0.5 for _ in values]
    order = sorted(values)
    return [(order.index(v) + (len(order) - 1 - order[::-1].index(v))) / 2 / (len(order) - 1)
            for v in values]


def score(results: list[GameResult]) -> None:
    """Relative score across the scanned list. Weights are a judgment call; see README."""
    scored = [r for r in results if r.videos]
    if not scored:
        return
    demand = percentile_ranks([math.log1p(r.median_vpd) for r in scored])
    momentum = percentile_ranks([r.momentum for r in scored])
    small = percentile_ranks([r.small_win_rate for r in scored])
    open_field = percentile_ranks([1 - r.top3_share for r in scored])
    english = [r.english_share for r in scored]
    for r, d, m, s, o, e in zip(scored, demand, momentum, small, open_field, english):
        r.score = round(100 * (0.30 * d + 0.20 * m + 0.25 * s + 0.15 * o + 0.10 * e), 1)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

COLUMNS = ["game", "score", "videos", "total_views", "median_vpd", "momentum", "small_win_rate",
           "top3_share", "shorts_view_share", "english_share", "best_small_video", "notes"]


def write_outputs(results: list[GameResult], out_dir: Path, *, days: int, quota_used: int) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    ranked = sorted(results, key=lambda r: r.score, reverse=True)

    csv_path = out_dir / f"scout-{stamp}.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in ranked:
            row = asdict(r)
            row["notes"] = "; ".join(r.notes)
            w.writerow({k: row[k] for k in COLUMNS})

    md_path = out_dir / f"scout-{stamp}.md"
    lines = [
        f"# YouTube game scout, {stamp} (uploads from the last {days} days)",
        "",
        f"Quota used this run: {quota_used} units.",
        "",
        "| # | Game | Score | Median views/day | Momentum | Small-channel wins | Top-3 share | Shorts share | English | Videos |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for i, r in enumerate(ranked, 1):
        lines.append(f"| {i} | {r.game} | {r.score} | {r.median_vpd:,.0f} | {r.momentum:.2f}x | "
                     f"{r.small_win_rate:.0%} | {r.top3_share:.0%} | {r.shorts_view_share:.0%} | "
                     f"{r.english_share:.0%} | {r.videos} |")
    lines += ["", "## Proof a small channel can win (best example per game)", ""]
    for r in ranked:
        if r.best_small_video:
            lines.append(f"- **{r.game}**: {r.best_small_video}")
    md_path.write_text("\n".join(lines) + "\n")
    return md_path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--games", type=Path, default=HERE / "games.txt")
    p.add_argument("--days", type=int, default=30, help="upload window (default 30)")
    p.add_argument("--region", default="US", help="regionCode for search (default US)")
    p.add_argument("--lang", default="en", help="relevanceLanguage for search (default en)")
    p.add_argument("--small-cap", type=int, default=100_000,
                   help="channels below this many subs count as small (default 100000)")
    p.add_argument("--limit", type=int, default=0, help="only scan the first N games")
    p.add_argument("--out", type=Path, default=HERE / "output")
    p.add_argument("--cache", type=Path, default=HERE / ".cache")
    p.add_argument("--dump-videos", action="store_true", help="also write every video row to JSON")
    args = p.parse_args(argv)

    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        print("Set YOUTUBE_API_KEY (free key: console.cloud.google.com, enable 'YouTube Data API v3').",
              file=sys.stderr)
        return 2

    games = load_games(args.games)
    if args.limit:
        games = games[:args.limit]
    quota = QuotaTracker()
    fetch = make_fetcher(key, args.cache, quota)
    now = dt.datetime.now(dt.timezone.utc)

    results, dump = [], {}
    for i, (name, query, pattern) in enumerate(games, 1):
        print(f"[{i}/{len(games)}] {name} ...", file=sys.stderr, flush=True)
        r, vids = scan_game(fetch, name, query, pattern, days=args.days, region=args.region,
                            lang=args.lang, small_cap=args.small_cap, now=now)
        results.append(r)
        if args.dump_videos:
            dump[name] = [{**asdict(v), "published": v.published.isoformat()} for v in vids]
    score(results)
    md = write_outputs(results, args.out, days=args.days, quota_used=quota.used)
    if args.dump_videos:
        (args.out / "videos.json").write_text(json.dumps(dump, indent=1))
    print(md.read_text())
    print(f"Wrote {md} and CSV. Quota used: {quota.used} units.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
