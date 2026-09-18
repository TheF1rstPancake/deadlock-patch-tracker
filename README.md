# Deadlock patch tracker

Pretty hero +/- board from Steam Deadlock changelogs, with a checked-in **PatchV2** event ledger so we can answer “what happened to X over time.”

Open the page → pick a patch → see **every hero touched** as a card (official-looking Valve hero card art, monogram fallback) → instantly read net **buff / nerf / mixed / fix / neutral** → skim color-coded line items. Search a hero to see which patches touched them (from `data/index.json`). Masthead **Patterns** opens a heroes-or-items heatmap of buff/nerf history (no win-rate / external stats).

Hash `#patterns` is the hero heatmap, `#patterns/items` the item heatmap, `#patterns/hero/{slug}` / `#patterns/item/{slug}` an entity chart. Roster (`#` or `#YYYY-MM-DD`) stays home.

The masthead **pulse** (under the lede) shouts the patch shape in the first five seconds from those same tallies, e.g. `9 buff · 5 nerf · 5 mixed · 1 fix`.

Default board sort is **buffs-first** for a friend scan: buff → nerf → mixed → fix → name (alphabetical within each bucket). Filter chips still narrow the grid; they do not change that order.

The live roster board is still heroes-only. Items, General, and system lines live in `events[]` (and the history index). The **Patterns** view reads those events for a hero heatmap and a separate item heatmap — they are never mixed in one matrix.

Heatmap cells:

- **Empty** = no events for that entity that patch (sparse “no touch,” not a painted zero).
- **Absolute** (default color): **Color** = signed net (**buffs − nerfs**). Fix and neutral are excluded from net; fixes can show as a hatch/dot. **Number / opacity** = buff+nerf **touch volume**, so +5/−5 churn is still visible.
- **Relative**: same hue (buff/nerf/churn), but **intensity is within-column percentile** of estimated **extent** versus other heroes (or items — never mixed) with ≥1 buff/nerf that same patch. Rank uses **max(buff extent, nerf extent)** so mixed churn still ranks as a loud hit. If **n≤3** that patch, there is **no percentile** (muted fill, not a fake rank). Empty stays empty.

Default overview sort is **A–Z** and shows **every hero** (or every item on the Items tab). **Recent volatility** (buff+nerf events in the **last 5 ingested patches**; hover the **?** — not a ~30-day window) and **Total touches** remain as chips; those ranked sorts may top-slice with **Show all**. The heatmap still windows to the **newest 10 patches**; **All patches** expands.

Entity detail keeps the **full patch history** on a diverging chart (buffs above zero, nerfs below) with **two labeled lenses** plus Counts — patches are not all equal, so “vs that day’s peers” is never the sole truth:

- **Across patches** (default) — **absolute extent**, the same approximate % math over time: “how hard was this change, period.” Y is clipped at a robust cap (P95 / next-loudest bar) so one stacked-% spike cannot flatten history; an **axis clipped** note appears when that happens. Hover **P#** is a *historical* percentile among every same-kind buff (or nerf) hit in the ledger, not that day’s peers.
- **That day** — within-patch percentile of buff/nerf extent among heroes (or items) touched **this patch only**. Quiet patches and bloodbaths aren’t the same. n of 3 or fewer: no rank (no fake %ile).
- **Counts** — per-patch event line volume.

Extent is **approximate** (summed relative % from each line’s parsed `from→to` metrics; structural/qualitative lines use `STRUCTURAL_EXTENT_WEIGHT` 20, other unmeasured lines `FALLBACK_EXTENT_WEIGHT` 5) — not win-rate. Click a buff/nerf bar (or the patch group) for the concrete lines in it. Cumulative net is an optional toggle, off by default; fixes stay dots, not bar height.

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
npm test          # classifier + parser + event tests
```

The UI reads checked-in JSON from `data/patches/*.json` (latest `date` by default; hash `#YYYY-MM-DD` selects another). Portraits live in `public/heroes/`.

The Vite config uses `base: './'` so a relative `dist/` copy works on GitHub project Pages, Meg, or any static host that is not at the domain root.

## Host it

### Meg (Tailscale / static folder)

Build, then copy `dist/` onto the box and serve it:

```bash
npm run build
scp -r dist/ meg:~/public/deadlock-patch-tracker
# on Meg:
cd ~/public/deadlock-patch-tracker
python3 -m http.server 4397
```

Open the Tailnet URL on port `4397`. Because `base` is relative, it does not need to sit at `/`.

### GitHub Pages

`.github/workflows/pages.yml` builds `dist` and deploys with `actions/deploy-pages`. Pages updates on merge to `main`.

**Private repo Pages** needs GitHub Pro (or an org with Pages enabled). Enabling Pages from a default private-repo token often fails with `Resource not accessible by integration`. Either:

- make the repo public, or
- turn on Pages in the repo settings once (Settings → Pages → GitHub Actions) with an account that can, then let the workflow deploy.

Until Pages is enabled, the workflow file is enough.

### Vercel

`vercel.json` sets `buildCommand` to `npm run build` and `outputDirectory` to `dist`. Import the repo; no extra project-root config.

## Refresh from Steam

Pull community announcements (`feeds=steam_community_announcements`), detect **sectioned / flat / prose** layouts, resolve each `- Name: change` against the hero roster ∪ item catalog (never assume hero on a flat list), classify, project `heroes[]` for the board, mirror raw BBCode, and rebuild `data/index.json`:

```bash
npm run ingest           # latest tagged patchnotes post
npm run ingest:all       # every reachable tagged patchnotes post
                         # (+ title-heuristic changelogs with bullets/sections)
```

Useful flags:

```bash
npm run ingest -- --dry-run
npm run ingest -- --gid 1844115010490072
npm run ingest -- --all --tagged-only
npm run ingest -- --from-file path/to/changelog.md
npm run ingest -- --no-preserve-overrides
```

`--from-file` accepts Steam BBCode or markdown (`## Heroes` / `[ Heroes ]`, or a flat `- Name: change` list).

After ingest, vendor hero card art for any new names, then commit JSON + `public/heroes/` + `data/raw/`:

```bash
npm run vendor-portraits
```

The UI does not call Steam or the assets API at runtime. Portraits are checked-in WebP from [deadlock-api](https://assets.deadlock-api.com) (Valve game files). This is a fan tracker, not affiliated with Valve. If a card 404s, the monogram initials stay as fallback.

If deadlock-api has no card for a new hero, pull the matching file from the wiki [Hero card images](https://deadlock.wiki/Category:Hero_card_images) category (`{Name} card.png`) into `public/heroes/{slug}.webp`. Unattended wiki downloads often hit Cloudflare, so that fallback is manual.

Steam’s community-announcements feed is a **rolling window**, not a forever archive. Ingest pages with `enddate`, but extra pages may be empty; we keep `data/raw/{gid}.bbcode.txt` so re-parse does not depend on Steam. See `docs/findings/steam-community-enddate.md`.

Unclear / low-confidence lines are flagged `parse.needsReview` for a Cursor cleanup pass (`docs/cursor-parse-patch.md`). Ingest is mechanical first — it does not call an LLM per line.

## Data shape (PatchV2)

Each `data/patches/{id}.json` is a **PatchV2** document. `events[]` is the source of truth. `heroes[]` is a projection of `target.kind === "hero"` for the current board.

```json
{
  "schemaVersion": 2,
  "id": "2026-09-16",
  "title": "Minor Update - 09-16-2026",
  "date": "2026-09-16",
  "steamUrl": "https://store.steampowered.com/news/app/1422450/view/…",
  "gid": "1844115010490072",
  "appid": 1422450,
  "layout": "sectioned",
  "sectionsPresent": ["General", "Items", "Heroes"],
  "events": [
    {
      "id": "1844115010490072:0",
      "section": "Heroes",
      "target": { "kind": "hero", "name": "Paige", "slug": "paige", "facet": "Captivating Read T1" },
      "tag": "buff",
      "metrics": [{ "stat": "cooldown_reduction", "from": -11, "to": -14, "unit": "s", "polarity": "up_is_buff" }],
      "raw": "Captivating Read T1 increased from -11s Cooldown to -14s",
      "display": "Captivating Read T1: cooldown reduction −11s → −14s (stronger CDR)",
      "clarified": true,
      "parse": { "confidence": "high", "needsReview": false, "source": "mechanical" }
    }
  ],
  "heroes": [
    {
      "name": "Paige",
      "sentiment": "buff",
      "changes": [
        {
          "raw": "Captivating Read T1 increased from -11s Cooldown to -14s",
          "display": "Captivating Read T1: cooldown reduction −11s → −14s (stronger CDR)",
          "clarified": true,
          "tag": "buff"
        }
      ]
    }
  ]
}
```

On disk:

| Path | What |
| --- | --- |
| `data/patches/{id}.json` | PatchV2 (events + heroes projection) |
| `data/raw/{gid}.bbcode.txt` | Steam contents mirror |
| `data/index.json` | Patch list + per-target touches/totals |
| `data/catalog.json` | Hero roster ∪ shop item catalog (+ system aliases) |

`raw` is Valve’s wording. `display` is our paraphrase when `clarified` is true; the UI shows a **Clarified** chip. Click or keyboard-activate the chip (`Enter` / `Space`) to expand `Steam: …` with the original line. One provenance footnote sits above the grid; the legend does not repeat it. If `display` is omitted, the board shows `raw`.

`id` is the calendar date from the title when unique. If two posts share a day, the file id becomes `{date}-{gid}`. `gid` is the stable Steam key.

### Overrides

The JSON is the source of truth. Heuristic misses are fine to correct by hand:

- Set `tag` on a change/event, and `"override": true` so the next ingest keeps it.
- Set `sentiment` on a hero, and `"override": true` to pin the card.
- Cursor cleanup (`docs/cursor-parse-patch.md`) should only rewrite `needsReview` / low-confidence fields and must not overwrite `override: true`.

Re-ingest preserves those fields unless you pass `--no-preserve-overrides`.

## Classification heuristic

Applied per line (the text after `Hero:` / `Item:`), first match wins:

1. **Fix** — `fix` / `fixed` / `bug` / collision wording, or UI/QoL (`target UI`, HUD, indicator). Bugfixes alone never become a buff.
2. **Neutral** — reworks with `instead of`.
3. **Nerf** — `can only` (targeting / usage restrictions).
4. **`no longer`** — removing a downside (`no longer pause/restart/get caught`) is a **buff**; otherwise a **nerf**.
5. **Cooldown (and similar inverted stats)** — if `cooldown` / `charge time` / `delay` appears *before* increased/reduced, the **absolute duration** changed: increased → nerf, reduced → buff. **Signed cooldown reduction** (`from -11s Cooldown to -14s`) is the opposite: more negative = stronger CDR = **buff**. Talent wording like Paige Captivating Read T1 stays a buff; `Dazzling Trick cooldown increased from 34s to 38s` is a nerf.
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

## Layouts ingest understands

Steam notes are not always `[ Heroes ]` sections:

- **sectioned** — `[ General ]` / `[ Items ]` / `[ Heroes ]` (and older Weapon / Vitality / Spirit Items, Hero Changes)
- **flat** — interleaved `- Celeste: …` / `- Restorative Locket: …` with no headers; kind comes from the catalog
- **prose** — matchmaking / visual / forum-link posts; stored with `needsReview`

## Later

- Item roster board (Patterns already charts items; the home grid is still heroes)
- Hosted refresh (still no auth)
