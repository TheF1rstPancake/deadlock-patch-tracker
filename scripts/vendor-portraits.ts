import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { heroPortraitSlug } from '../src/lib/portraits.ts'
import type { Patch } from '../src/types.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PATCH_DIR = path.join(ROOT, 'data', 'patches')
const OUT_DIR = path.join(ROOT, 'public', 'heroes')
const ASSETS_URL = 'https://assets.deadlock-api.com/v2/heroes?language=english'
// Wiki Category:Hero card images is the manual fallback when the API has no
// display-name match. Cloudflare often blocks unattended wiki downloads.

interface ApiHero {
  name: string
  images?: {
    icon_hero_card_webp?: string
    icon_hero_card?: string
    selection_image?: string
  }
}

async function loadPatchHeroNames(): Promise<string[]> {
  const files = (await readdir(PATCH_DIR)).filter((file) => file.endsWith('.json'))
  const names = new Set<string>()
  for (const file of files) {
    const patch = JSON.parse(
      await readFile(path.join(PATCH_DIR, file), 'utf8'),
    ) as Patch
    for (const hero of patch.heroes) names.add(hero.name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

async function fetchApiHeroes(): Promise<Map<string, ApiHero>> {
  const response = await fetch(ASSETS_URL, {
    headers: { 'User-Agent': 'deadlock-patch-tracker (fan tracker)' },
  })
  if (!response.ok) {
    throw new Error(`Hero assets API failed: ${response.status}`)
  }
  const heroes = (await response.json()) as ApiHero[]
  return new Map(heroes.map((hero) => [hero.name, hero]))
}

function cardUrl(hero: ApiHero): string | undefined {
  return (
    hero.images?.icon_hero_card_webp ||
    hero.images?.icon_hero_card ||
    hero.images?.selection_image
  )
}

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'deadlock-patch-tracker (fan tracker)' },
  })
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${url}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(dest, bytes)
}

async function main() {
  const names = await loadPatchHeroNames()
  const api = await fetchApiHeroes()
  await mkdir(OUT_DIR, { recursive: true })

  const missing: string[] = []
  for (const name of names) {
    const hero = api.get(name)
    const url = hero ? cardUrl(hero) : undefined
    if (!url) {
      const wikiHint = `https://deadlock.wiki/Category:Hero_card_images (${name} card.png)`
      missing.push(`${name} — wiki: ${wikiHint}`)
      continue
    }
    const dest = path.join(OUT_DIR, `${heroPortraitSlug(name)}.webp`)
    await download(url, dest)
    console.log(`vendored ${name} → ${path.relative(ROOT, dest)}`)
  }

  if (missing.length > 0) {
    throw new Error(`No hero card art for: ${missing.join(', ')}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
