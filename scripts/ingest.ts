import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalogIndex, loadCatalog, type CatalogFile } from '../src/lib/catalog.ts'
import {
  applyPreviousEvents,
  buildEvents,
  projectHeroes,
} from '../src/lib/events.ts'
import { buildHistoryIndex } from '../src/lib/indexPatches.ts'
import {
  patchDateFromTitle,
  steamNewsUrl,
  stripSteamMarkup,
} from '../src/lib/parseNews.ts'
import type { Patch } from '../src/types.ts'

const APP_ID = 1422450
const NEWS_BASE =
  `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/` +
  `?appid=${APP_ID}&count=40&maxlength=0&format=json&feeds=steam_community_announcements`

const HEROES_API = 'https://assets.deadlock-api.com/v2/heroes?language=english'
const ITEMS_API = 'https://assets.deadlock-api.com/v2/items?language=english'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PATCH_DIR = path.join(ROOT, 'data', 'patches')
const RAW_DIR = path.join(ROOT, 'data', 'raw')
const CATALOG_PATH = path.join(ROOT, 'data', 'catalog.json')
const INDEX_PATH = path.join(ROOT, 'data', 'index.json')

const SEED_URLS: Record<string, string> = {
  '1844115010490072':
    'https://store.steampowered.com/news/app/1422450/view/698776157349216434',
}

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
  const args = {
    dryRun: false,
    fromFile: '',
    gid: '',
    preserve: true,
    all: false,
    taggedOnly: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--from-file') args.fromFile = argv[++i] ?? ''
    else if (a === '--gid') args.gid = argv[++i] ?? ''
    else if (a === '--no-preserve-overrides') args.preserve = false
    else if (a === '--all') args.all = true
    else if (a === '--tagged-only') args.taggedOnly = true
  }
  return args
}

function isTaggedPatchNotes(item: SteamNewsItem): boolean {
  return (item.tags ?? []).includes('patchnotes')
}

function titleLooksLikePatch(title: string): boolean {
  return /\b(update|patch|hotfix|changelog)\b/i.test(title)
}

function isPatchCandidate(item: SteamNewsItem, taggedOnly: boolean): boolean {
  if (isTaggedPatchNotes(item)) return true
  if (taggedOnly) return false
  return titleLooksLikePatch(item.title)
}

async function fetchNewsPage(enddate?: number): Promise<SteamNewsItem[]> {
  const url = enddate ? `${NEWS_BASE}&enddate=${enddate}` : NEWS_BASE
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Steam news HTTP ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as SteamNewsResponse
  return json.appnews?.newsitems ?? []
}

/**
 * Walk GetNewsForApp with `enddate`. The community-announcements feed currently
 * stops after one window (~37 posts); further pages come back empty. See
 * docs/findings/steam-community-enddate.md.
 */
async function fetchAllNews(): Promise<SteamNewsItem[]> {
  const seen = new Set<string>()
  const all: SteamNewsItem[] = []
  let enddate: number | undefined
  for (let page = 0; page < 20; page += 1) {
    const items = await fetchNewsPage(enddate)
    const fresh = items.filter((item) => !seen.has(item.gid))
    if (fresh.length === 0) break
    for (const item of fresh) {
      seen.add(item.gid)
      all.push(item)
    }
    const oldest = Math.min(...items.map((item) => item.date))
    enddate = oldest - 1
  }
  return all
}

async function refreshCatalog(): Promise<ReturnType<typeof buildCatalogIndex>> {
  try {
    const [heroesRes, itemsRes] = await Promise.all([
      fetch(HEROES_API, {
        headers: { 'User-Agent': 'deadlock-patch-tracker (fan tracker)' },
      }),
      fetch(ITEMS_API, {
        headers: { 'User-Agent': 'deadlock-patch-tracker (fan tracker)' },
      }),
    ])
    if (heroesRes.ok && itemsRes.ok) {
      const heroesJson = (await heroesRes.json()) as Array<{
        name?: string
      }>
      const itemsJson = (await itemsRes.json()) as Array<{
        name?: string
        type?: string
      }>
      const existing = JSON.parse(
        await readFile(CATALOG_PATH, 'utf8'),
      ) as CatalogFile
      const heroes = uniqueNames(
        heroesJson
          .map((hero) => hero.name?.trim() ?? '')
          .filter((name) => name && !name.startsWith('hero_')),
      ).map((name) => ({ name, slug: slugFrom(name) }))
      const items = uniqueNames(
        itemsJson
          .filter((item) => item.type === 'upgrade')
          .map((item) => item.name?.trim() ?? '')
          .filter(
            (name) =>
              name &&
              !/^(upgrade_|citadel_|ability_)/i.test(name),
          ),
      ).map((name) => ({ name, slug: slugFrom(name) }))
      const next: CatalogFile = {
        ...existing,
        heroes,
        items,
      }
      await writeFile(
        CATALOG_PATH,
        `${JSON.stringify(next, null, 2)}\n`,
        'utf8',
      )
      return buildCatalogIndex(loadCatalog(next))
    }
  } catch {
    // Fall through to the checked-in snapshot.
  }
  const raw = JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as CatalogFile
  return buildCatalogIndex(loadCatalog(raw))
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function slugFrom(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function readAllPatches(): Promise<Patch[]> {
  const files = (await readdir(PATCH_DIR).catch(() => [])).filter((file) =>
    file.endsWith('.json'),
  )
  const patches: Patch[] = []
  for (const file of files) {
    const raw = await readFile(path.join(PATCH_DIR, file), 'utf8')
    patches.push(JSON.parse(raw) as Patch)
  }
  return patches
}

async function readExistingByGid(gid: string): Promise<Patch | null> {
  const patches = await readAllPatches()
  return patches.find((patch) => patch.gid === gid) ?? null
}

async function readExistingById(id: string): Promise<Patch | null> {
  try {
    const raw = await readFile(path.join(PATCH_DIR, `${id}.json`), 'utf8')
    return JSON.parse(raw) as Patch
  } catch {
    return null
  }
}

function assignPatchId(date: string, gid: string, existing: Patch[]): string {
  const clash = existing.find((patch) => patch.id === date && patch.gid !== gid)
  if (clash) return `${date}-${gid}`
  const same = existing.find((patch) => patch.gid === gid)
  return same?.id ?? date
}

function patchFromParsed(
  item: {
    gid: string
    title: string
    date: string
    unix?: number
    contents: string
    steamUrl?: string
  },
  previous: Patch | null,
  preserve: boolean,
  catalog: ReturnType<typeof buildCatalogIndex>,
  existing: Patch[],
): Patch {
  const plain = stripSteamMarkup(item.contents)
  const built = buildEvents({ gid: item.gid, plain, catalog })
  const events = applyPreviousEvents(built.events, previous, preserve)
  const heroes = projectHeroes(events, previous, preserve)
  const id = assignPatchId(item.date, item.gid, existing)
  return {
    schemaVersion: 2,
    id,
    title: item.title,
    date: item.date,
    steamUrl:
      previous?.steamUrl ??
      item.steamUrl ??
      SEED_URLS[item.gid] ??
      steamNewsUrl(APP_ID, item.gid),
    gid: item.gid,
    appid: APP_ID,
    layout: built.layout,
    sectionsPresent: built.sectionsPresent,
    events,
    heroes,
  }
}

async function patchFromSteam(
  item: SteamNewsItem,
  preserve: boolean,
  catalog: ReturnType<typeof buildCatalogIndex>,
  existing: Patch[],
): Promise<Patch> {
  const date = patchDateFromTitle(item.title, item.date)
  const previous = preserve
    ? ((await readExistingByGid(item.gid)) ?? (await readExistingById(date)))
    : null
  return patchFromParsed(
    {
      gid: item.gid,
      title: item.title,
      date,
      unix: item.date,
      contents: item.contents,
      steamUrl: SEED_URLS[item.gid],
    },
    previous,
    preserve,
    catalog,
    existing,
  )
}

async function patchFromFile(
  filePath: string,
  preserve: boolean,
  catalog: ReturnType<typeof buildCatalogIndex>,
  existing: Patch[],
): Promise<{ patch: Patch; raw: string }> {
  const raw = await readFile(filePath, 'utf8')
  const titleMatch = raw.match(/^#\s+(.+)$/m)
  const title = (titleMatch?.[1]?.trim() ?? 'Deadlock Update').replace(
    /\(Heroes section only\)/i,
    '',
  ).trim()
  const dateMatch = raw.match(/(\d{2})-(\d{2})-(\d{4})/)
  const date = dateMatch
    ? `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`
    : new Date().toISOString().slice(0, 10)
  const urlMatch = raw.match(/https:\/\/store\.steampowered\.com\/news\/[^\s)]+/)
  const gidMatch = raw.match(/gid:\s*(\d+)/i)
  const gid = gidMatch?.[1] ?? ''
  const previous = preserve
    ? ((gid ? await readExistingByGid(gid) : null) ??
      (await readExistingById(date)))
    : null
  const patch = patchFromParsed(
    {
      gid,
      title,
      date,
      contents: raw,
      steamUrl: urlMatch?.[0],
    },
    previous,
    preserve,
    catalog,
    existing,
  )
  return { patch, raw }
}

function hasParseableBody(item: SteamNewsItem): boolean {
  const plain = stripSteamMarkup(item.contents)
  const built = buildEvents({ gid: item.gid, plain })
  if (isTaggedPatchNotes(item)) return true
  return built.layout !== 'prose' || built.events.length > 1
}

function summarize(patch: Patch): string {
  const counts = { buff: 0, nerf: 0, mixed: 0, fix: 0, neutral: 0 }
  for (const hero of patch.heroes) counts[hero.sentiment] += 1
  const kinds = { hero: 0, item: 0, general: 0, system: 0, unknown: 0 }
  let needsReview = 0
  for (const event of patch.events) {
    kinds[event.target.kind] += 1
    if (event.parse.needsReview) needsReview += 1
  }
  return [
    `${patch.title} (${patch.date}) layout=${patch.layout} events=${patch.events.length} heroes=${patch.heroes.length}`,
    `hero ${kinds.hero} · item ${kinds.item} · general ${kinds.general} · system ${kinds.system} · unknown ${kinds.unknown} · needsReview ${needsReview}`,
    `board buff ${counts.buff} · nerf ${counts.nerf} · mixed ${counts.mixed} · fix ${counts.fix} · neutral ${counts.neutral}`,
  ].join('\n')
}

async function writePatch(
  patch: Patch,
  rawContents: string | undefined,
  dryRun: boolean,
): Promise<void> {
  const outPath = path.join(PATCH_DIR, `${patch.id}.json`)
  const json = `${JSON.stringify(patch, null, 2)}\n`
  if (dryRun) {
    console.log(summarize(patch))
    console.log(`Would write ${outPath}`)
    if (rawContents !== undefined && patch.gid) {
      console.log(`Would write ${path.join(RAW_DIR, `${patch.gid}.bbcode.txt`)}`)
    }
    return
  }
  await mkdir(PATCH_DIR, { recursive: true })
  await writeFile(outPath, json, 'utf8')
  if (rawContents !== undefined && patch.gid) {
    await mkdir(RAW_DIR, { recursive: true })
    await writeFile(
      path.join(RAW_DIR, `${patch.gid}.bbcode.txt`),
      rawContents.endsWith('\n') ? rawContents : `${rawContents}\n`,
      'utf8',
    )
  }
  console.log(summarize(patch))
  console.log(`Wrote ${outPath}`)
}

async function writeIndex(dryRun: boolean): Promise<void> {
  const patches = await readAllPatches()
  const index = buildHistoryIndex(patches)
  const json = `${JSON.stringify(index, null, 2)}\n`
  if (dryRun) {
    console.log(
      `Would write ${INDEX_PATH} (${index.patches.length} patches, ${Object.keys(index.targets).length} targets)`,
    )
    return
  }
  await writeFile(INDEX_PATH, json, 'utf8')
  console.log(
    `Wrote ${INDEX_PATH} (${index.patches.length} patches, ${Object.keys(index.targets).length} targets)`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const catalog = await refreshCatalog()
  const existing = await readAllPatches()

  if (args.fromFile) {
    const { patch, raw } = await patchFromFile(
      path.resolve(args.fromFile),
      args.preserve,
      catalog,
      existing,
    )
    await writePatch(patch, raw, args.dryRun)
    await writeIndex(args.dryRun)
    return
  }

  const news = await fetchAllNews()
  if (news.length === 0) {
    throw new Error('Steam news feed returned no community announcements')
  }

  if (args.gid) {
    const item = news.find((entry) => entry.gid === args.gid)
    if (!item) throw new Error(`No news item with gid ${args.gid}`)
    const patch = await patchFromSteam(item, args.preserve, catalog, existing)
    await writePatch(patch, item.contents, args.dryRun)
    await writeIndex(args.dryRun)
    return
  }

  const candidates = news.filter((item) =>
    isPatchCandidate(item, args.taggedOnly),
  )

  if (args.all) {
    const selected = candidates.filter((item) => {
      if (!isTaggedPatchNotes(item) && !hasParseableBody(item)) return false
      const plain = stripSteamMarkup(item.contents)
      const preview = buildEvents({ gid: item.gid, plain, catalog })
      return preview.events.length > 0
    })
    if (selected.length === 0) {
      throw new Error('No reachable patch notes to backfill')
    }
    let written = 0
    for (const item of selected) {
      const patch = await patchFromSteam(
        item,
        args.preserve,
        catalog,
        existing,
      )
      if (patch.events.length === 0) continue
      existing.push(patch)
      await writePatch(patch, item.contents, args.dryRun)
      written += 1
    }
    await writeIndex(args.dryRun)
    console.log(`Backfilled ${written} patches`)
    return
  }

  const latest =
    candidates.find((item) => isTaggedPatchNotes(item)) ?? candidates[0]
  if (!latest) {
    throw new Error('No Steam community patch notes found')
  }
  const patch = await patchFromSteam(latest, args.preserve, catalog, existing)
  await writePatch(patch, latest.contents, args.dryRun)
  await writeIndex(args.dryRun)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
