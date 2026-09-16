import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyLine, netSentiment } from '../src/lib/classify.ts'
import { autoClarify } from '../src/lib/clarify.ts'
import {
  extractSection,
  groupLinesByHero,
  parseHeroLines,
  patchDateFromTitle,
  steamNewsUrl,
  stripSteamMarkup,
} from '../src/lib/parseNews.ts'
import type { HeroChange, HeroPatch, Patch } from '../src/types.ts'

const APP_ID = 1422450
const NEWS_ENDPOINT =
  `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/` +
  `?appid=${APP_ID}&count=40&maxlength=0&format=json&feeds=steam_community_announcements`

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PATCH_DIR = path.join(ROOT, 'data', 'patches')

interface SteamNewsItem {
  gid: string
  title: string
  url: string
  contents: string
  date: number
  feedname: string
  tags?: string[]
}

interface SteamNewsResponse {
  appnews: { newsitems: SteamNewsItem[] }
}

function parseArgs(argv: string[]) {
  const args = { dryRun: false, fromFile: '', gid: '', preserve: true }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--from-file') args.fromFile = argv[++i] ?? ''
    else if (a === '--gid') args.gid = argv[++i] ?? ''
    else if (a === '--no-preserve-overrides') args.preserve = false
  }
  return args
}

function isPatchNotes(item: SteamNewsItem): boolean {
  const tags = item.tags ?? []
  if (tags.includes('patchnotes')) return true
  return /\b(update|patch|hotfix|changelog)\b/i.test(item.title)
}

async function fetchLatestPatchItem(gid: string): Promise<SteamNewsItem> {
  const res = await fetch(NEWS_ENDPOINT)
  if (!res.ok) {
    throw new Error(`Steam news HTTP ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as SteamNewsResponse
  const items = json.appnews?.newsitems ?? []
  if (gid) {
    const match = items.find((item) => item.gid === gid)
    if (!match) throw new Error(`No news item with gid ${gid}`)
    return match
  }
  const patch = items.find(
    (item) =>
      isPatchNotes(item) &&
      extractSection(stripSteamMarkup(item.contents), 'Heroes'),
  )
  if (!patch) {
    throw new Error('No Steam community patch notes with a [ Heroes ] section')
  }
  return patch
}

function buildHeroes(
  section: string,
  previous: Patch | null,
  preserve: boolean,
): HeroPatch[] {
  const grouped = groupLinesByHero(parseHeroLines(section))
  const prevByName = new Map(
    (previous?.heroes ?? []).map((hero) => [hero.name, hero]),
  )

  const heroes: HeroPatch[] = []
  for (const [name, texts] of grouped) {
    const prev = preserve ? prevByName.get(name) : undefined
    const prevChanges = new Map(
      (prev?.changes ?? []).map((c) => [c.raw, c] as const),
    )

    const changes: HeroChange[] = texts.map((text) => {
      const prior = prevChanges.get(text)
      const auto = autoClarify(text)
      const change: HeroChange = {
        raw: text,
        tag:
          preserve && prior?.override && prior.tag
            ? prior.tag
            : classifyLine(text),
      }
      if (preserve && prior?.override) change.override = true
      const display = prior?.display ?? auto.display
      if (display && display !== text) {
        change.display = display
        change.clarified = true
      }
      return change
    })

    const sentiment =
      prev?.override && prev.sentiment
        ? prev.sentiment
        : netSentiment(changes.map((c) => c.tag))

    const hero: HeroPatch = { name, sentiment, changes }
    if (prev?.override) hero.override = true
    heroes.push(hero)
  }

  heroes.sort((a, b) => a.name.localeCompare(b.name))
  return heroes
}

async function readExisting(id: string): Promise<Patch | null> {
  try {
    const raw = await readFile(path.join(PATCH_DIR, `${id}.json`), 'utf8')
    return JSON.parse(raw) as Patch
  } catch {
    return null
  }
}

async function patchFromSteam(
  item: SteamNewsItem,
  preserve: boolean,
): Promise<Patch> {
  const plain = stripSteamMarkup(item.contents)
  const section = extractSection(plain, 'Heroes')
  if (!section) {
    throw new Error(`News "${item.title}" has no [ Heroes ] section`)
  }
  const date = patchDateFromTitle(item.title, item.date)
  const previous = preserve ? await readExisting(date) : null
  const seedUrl =
    item.gid === '1844115010490072'
      ? 'https://store.steampowered.com/news/app/1422450/view/698776157349216434'
      : steamNewsUrl(APP_ID, item.gid)

  return {
    id: date,
    title: item.title,
    date,
    steamUrl: seedUrl,
    gid: item.gid,
    appid: APP_ID,
    heroes: buildHeroes(section, previous, preserve),
  }
}

async function patchFromFile(
  filePath: string,
  preserve: boolean,
): Promise<Patch> {
  const raw = await readFile(filePath, 'utf8')
  const titleMatch = raw.match(/^#\s+(.+)$/m)
  const title = titleMatch?.[1]?.trim() ?? 'Deadlock Update'
  const dateMatch = raw.match(/(\d{2})-(\d{2})-(\d{4})/)
  const date = dateMatch
    ? `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`
    : new Date().toISOString().slice(0, 10)
  const urlMatch = raw.match(/https:\/\/store\.steampowered\.com\/news\/[^\s)]+/)
  const gidMatch = raw.match(/gid:\s*(\d+)/i)
  const plain = stripSteamMarkup(raw)
  const section = extractSection(plain, 'Heroes')
  if (!section) {
    throw new Error(`File ${filePath} has no Heroes section`)
  }
  const previous = preserve ? await readExisting(date) : null
  return {
    id: date,
    title: title.replace(/\(Heroes section only\)/i, '').trim(),
    date,
    steamUrl:
      urlMatch?.[0] ??
      steamNewsUrl(APP_ID, gidMatch?.[1] ?? 'unknown'),
    gid: gidMatch?.[1] ?? '',
    appid: APP_ID,
    heroes: buildHeroes(section, previous, preserve),
  }
}

function summarize(patch: Patch): string {
  const counts = { buff: 0, nerf: 0, mixed: 0, fix: 0, neutral: 0 }
  for (const hero of patch.heroes) counts[hero.sentiment] += 1
  return [
    `${patch.title} (${patch.date}) — ${patch.heroes.length} heroes`,
    `buff ${counts.buff} · nerf ${counts.nerf} · mixed ${counts.mixed} · fix ${counts.fix} · neutral ${counts.neutral}`,
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const patch = args.fromFile
    ? await patchFromFile(path.resolve(args.fromFile), args.preserve)
    : await patchFromSteam(await fetchLatestPatchItem(args.gid), args.preserve)

  const outPath = path.join(PATCH_DIR, `${patch.id}.json`)
  const json = `${JSON.stringify(patch, null, 2)}\n`
  if (args.dryRun) {
    console.log(summarize(patch))
    console.log(`Would write ${outPath}`)
    return
  }
  await mkdir(PATCH_DIR, { recursive: true })
  await writeFile(outPath, json, 'utf8')
  console.log(summarize(patch))
  console.log(`Wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
