# YouTube game scout

Finds games that are **gaining views on YouTube right now** and where **small channels can
still rank**, using YouTube's own data instead of articles.

For every game in `games.txt` it pulls the 50 most-viewed uploads from the last 30 days
(US region, English relevance), then measures:

| Metric | What it tells you |
|---|---|
| Median views/day | Real demand: how many views a typical top upload earns per day since publishing |
| Momentum | Median views/day of uploads from the last 7 days ÷ uploads from days 8-30. Above 1 = rising |
| Small-channel wins | Share of top videos from channels under 100K subs that got more views than they have subscribers. High = the algorithm is handing views to newcomers |
| Top-3 share | Share of views captured by the 3 biggest channels. High = locked up by big creators |
| Shorts share | How much of the demand is Shorts (RPM ~$0.02-0.08) vs long-form |
| English share | Views on English-audio videos. Proxy for higher ad RPM |

**Score** (0-100, relative to the other games in the same run):
30% demand, 25% small-channel wins, 20% momentum, 15% open field, 10% English share.
The weights are a judgment call. Sort the CSV by whichever column you care about.

## Run

```bash
export YOUTUBE_API_KEY=...   # console.cloud.google.com → enable "YouTube Data API v3" → Credentials → API key
python3 scout.py                    # all games in games.txt
python3 scout.py --limit 5          # quick test on the first 5
python3 scout.py --days 14 --small-cap 50000 --dump-videos
python3 -m unittest test_scout.py   # offline tests, no key needed
```

Output: `output/scout-YYYY-MM-DD.md` and `.csv` (the md also links the best small-channel video per game,
so you can study what worked).

## Limits (read before trusting a number)

- **Quota:** each game costs ~102 of the free 10,000 daily units, so ~95 games a day. Responses are cached
  per day in `.cache/`, so re-running is free.
- **Top-50 sample:** search returns at most 50 videos per query, so this measures the head of demand, not
  every upload. Games with huge volume (Minecraft, Roblox) are under-counted, which is fine for finding
  mid-tier openings.
- **Momentum bias:** fresh uploads naturally earn more views/day than older ones, so every game leans
  above 1. Compare momentum *between games*, not against 1.
- **Search is not personalised** here (API, no login), unlike the YouTube app, where "Watched" chips show
  results are tuned to your history.
- **Title matching:** a game counts only if the title matches its regex in `games.txt`. Short or generic
  names (PEAK, REPO, Deadlock) have custom patterns but can still pick up noise.
- **Not measured:** RPM itself (only YouTube Studio shows yours), sponsorship demand, or search volume.
