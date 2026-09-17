# Steam community `enddate` pagination window

**finding:** `steam-community-enddate`

`ISteamNews/GetNewsForApp` with `feeds=steam_community_announcements`, `maxlength=0`, and `count=40` currently returns the latest ~37 Deadlock community posts and then stops.

Paging with `enddate=<oldest unix - 1>` yields an empty `newsitems` array — not an error. That is a Steam feed-window quirk, not a bug in the ingest loop. The CLI still walks `enddate` so a wider window starts working if Valve’s API grows.

**What to do**

- Mirror `data/raw/{gid}.bbcode.txt` so re-parse does not depend on Steam forever.
- Treat “all reachable tagged `patchnotes`” as the posts inside that window (plus title-heuristic changelogs that actually have sections or bullets).
- Do not assume the API is a complete historical archive.

Sampled 2026-09-17 against appid `1422450`.
