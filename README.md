# Deadlock patch tracker

Pretty hero +/- board from the latest Steam Deadlock changelog.

Open the page → see **every hero touched in the most recent patch** as a card → instantly read net **buff / nerf / mixed / fix / neutral** → skim color-coded line items.

V1 is a single-patch snapshot. No login. Items and General are not first-class cards.

Steam appid: `1422450`.

## Run

```bash
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`).

```bash
npm run build     # production bundle; must pass
npm run preview   # serve the build
npm test          # classifier + parser tests
```

The UI reads checked-in JSON from `data/patches/*.json` and shows the **latest `date`**. Sep 16, 2026 is preloaded.

## Refresh from Steam

Pull the newest community patch notes (feed `steam_community_announcements`), parse `[ Heroes ]`, classify each line, and write `data/patches/YYYY-MM-DD.json`:

```bash
npm run ingest
```

Useful flags:

```bash
npm run ingest -- --dry-run
npm run ingest -- --gid 1844115010490072
npm run ingest -- --from-file path/to/changelog.md
npm run ingest -- --no-preserve-overrides
```

`--from-file` accepts Steam BBCode or markdown with a `## Heroes` (or `[ Heroes ]`) section and `- Hero: change` bullets.

After ingest, commit the JSON. The UI does not call Steam at runtime.

## Data shape

```json
{
  "id": "2026-09-16",
  "title": "Minor Update - 09-16-2026",
  "date": "2026-09-16",
  "steamUrl": "https://store.steampowered.com/news/app/1422450/view/…",
  "gid": "1844115010490072",
  "appid": 1422450,
  "heroes": [
    {
      "name": "Viscous",
      "sentiment": "mixed",
      "changes": [
        { "text": "Alt fire damage growth reduced by 10%", "tag": "nerf" }
      ]
    }
  ]
}
```

### Overrides

The JSON is the source of truth. Heuristic misses are fine to correct by hand:

- Set `tag` on a change, and `"override": true` so the next ingest keeps it.
- Set `sentiment` on a hero, and `"override": true` to pin the card.

Re-ingest preserves those fields unless you pass `--no-preserve-overrides`.

## Classification heuristic

Applied per line (the text after `Hero:`), first match wins:

1. **Fix** — `fix` / `fixed` / `bug` / collision wording, or UI/QoL (`target UI`, HUD, indicator). Bugfixes alone never become a buff.
2. **Neutral** — reworks with `instead of`.
3. **Nerf** — `can only` (targeting / usage restrictions).
4. **`no longer`** — removing a downside (`no longer pause/restart/get caught`) is a **buff**; otherwise a **nerf**.
5. **Cooldown (and similar inverted stats)** — if `cooldown` / `charge time` / `delay` appears *before* increased/reduced, the duration itself changed: increased → nerf, reduced → buff. Talent wording like `increased from -11s Cooldown` is **not** inverted (the verb comes first) → buff.
6. **`increased` / `raised`** → buff; **`reduced` / `decreased` / `lowered`** → nerf.
7. **Bare `from X to Y`** — if the number went up, buff; down, nerf (covers notes that omit a verb).
8. **New upside** — `now also`, `now works`, `can now`, `now scales`, `now grants`, `now increases`, `now deals` → buff.
9. Anything else → **neutral**.

Hero card sentiment from the line tags:

| Lines | Card |
| --- | --- |
| Any buff **and** any nerf | **mixed** (fixes ignored for direction) |
| Buffs, no nerfs | **buff** (fixes allowed, e.g. Paige) |
| Nerfs, no buffs | **nerf** |
| Only fixes / UI, plus optional neutrals | **fix** (e.g. Rem) |
| Only neutrals | **neutral** |

Sep 16 sanity checks: Viscous mixed, Celeste nerf, Graves buff, Rem fix.

## V2 roadmap

- Multi-patch history and a “who gets nerfed routinely” view
- Items and General as first-class cards
- Stronger classification (ability-stat polarity, human review queue)
- Optional hero portraits
- Hosted refresh (still no auth)
