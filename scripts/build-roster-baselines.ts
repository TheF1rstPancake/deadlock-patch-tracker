/**
 * Build checked-in live roster property bags for absolute extent scoring.
 *
 * Hits deadlock-api heroes + items, classifies numeric properties into the
 * same families as the abs-roster-norm eval, and writes `data/roster-baselines.json`.
 *
 * The static site must NOT call this API from the browser — regenerate locally
 * or in CI, then commit the JSON:
 *
 *   npx tsx scripts/build-roster-baselines.ts
 *   npm run build-roster-baselines
 *
 * Sources:
 *   https://api.deadlock-api.com/v1/assets/heroes
 *   https://api.deadlock-api.com/v1/assets/items
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Keep in sync with `MIN_ROSTER_SAMPLE` in `src/lib/rosterBaselines.ts`. */
const MIN_ROSTER_SAMPLE = 5

const HEROES_URL = 'https://api.deadlock-api.com/v1/assets/heroes'
const ITEMS_URL = 'https://api.deadlock-api.com/v1/assets/items'
const USER_AGENT = 'deadlock-patch-tracker (fan tracker; roster baselines)'

type RosterFamily =
  | 'spirit_coeff'
  | 'spirit_coeff_damage'
  | 'spirit_coeff_melee'
  | 'cooldown_s'
  | 'duration_s'
  | 'range_base_m'
  | 'range_bonus_m'
  | 'radius_m'
  | 'damage_flat'
  | 'damage_pct'
  | 'health_flat'
  | 'resist_pct'
  | 'sustain_pct'
  | 'sustain_flat'
  | 'mobility_speed'
  | 'mobility_stamina'
  | 'fire_rate_pct'
  | 'cc_pct'
  | 'melee_damage_flat'
  | 'tech_duration_mult'
  | 'tech_range_mult'
  | 'hero_scaling_scale'

interface RosterFamilyBag {
  n: number
  min: number
  p50: number
  max: number
  values: number[]
}

interface RosterBaselinesFile {
  generatedAt: string
  source: { heroes: string; items: string }
  minSampleSize: number
  families: Record<string, RosterFamilyBag>
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = path.join(ROOT, 'data', 'roster-baselines.json')

/** Domain caps so NPC/boss outliers do not flatten hero/item packs. */
const FAMILY_BOUNDS: Partial<Record<RosterFamily, { min: number; max: number }>> = {
  cooldown_s: { min: 0.01, max: 270 },
  duration_s: { min: 0.1, max: 60 },
  radius_m: { min: 0.1, max: 40 },
  range_base_m: { min: 5.5, max: 1400 },
  range_bonus_m: { min: 1, max: 12 },
  damage_flat: { min: 1.5, max: 350 },
  damage_pct: { min: 0.0001, max: 400 },
  health_flat: { min: 2, max: 10_000 },
  resist_pct: { min: 1, max: 100 },
  sustain_pct: { min: 2.3, max: 100 },
  sustain_flat: { min: 1.2, max: 700 },
  fire_rate_pct: { min: 5, max: 300 },
  cc_pct: { min: 0.5, max: 120 },
  spirit_coeff: { min: 0.0015, max: 125 },
  spirit_coeff_damage: { min: 0.0015, max: 125 },
  spirit_coeff_melee: { min: 0.6, max: 1.5 },
  hero_scaling_scale: { min: 0.008, max: 0.5 },
}

type Json = Record<string, unknown>

interface ItemProperty {
  value?: unknown
  css_class?: string
  postfix?: string
  label?: string
  provided_property_type?: string
  disable_value?: unknown
  scale_function?: {
    class_name?: string
    specific_stat_scale_type?: string
    stat_scale?: unknown
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status}`)
  }
  return response.json()
}

function parseNum(value: unknown): number | undefined {
  if (typeof value === 'boolean' || value == null) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^[+-]?(?:\d+\.?\d*|\.\d+)/)
  if (!match) return undefined
  const n = Number.parseFloat(match[0])
  return Number.isFinite(n) ? n : undefined
}

function isDummy(value: number, prop: ItemProperty): boolean {
  if (value === 0 || value === -1) return true
  const disabled = parseNum(prop.disable_value)
  return disabled !== undefined && value === disabled
}

function inBounds(family: RosterFamily, value: number): boolean {
  const bounds = FAMILY_BOUNDS[family]
  if (!bounds) return value > 0
  return value >= bounds.min && value <= bounds.max
}

function push(
  bags: Map<RosterFamily, number[]>,
  family: RosterFamily,
  value: number,
): void {
  if (!inBounds(family, value)) return
  const bag = bags.get(family)
  if (bag) bag.push(value)
  else bags.set(family, [value])
}

function css(prop: ItemProperty): string {
  return prop.css_class ?? ''
}

function label(prop: ItemProperty): string {
  return prop.label ?? ''
}

function postfix(prop: ItemProperty): string {
  return (prop.postfix ?? '').trim()
}

function isPercent(prop: ItemProperty, valueRaw: unknown): boolean {
  if (postfix(prop) === '%') return true
  return typeof valueRaw === 'string' && valueRaw.includes('%')
}

function collectHeroStats(heroes: Json[], bags: Map<RosterFamily, number[]>): void {
  for (const hero of heroes) {
    const starting = (hero.starting_stats ?? {}) as Record<string, Json>
    const num = (key: string): number | undefined => {
      const row = starting[key]
      if (!row || typeof row !== 'object') return undefined
      return parseNum((row as Json).value)
    }
    const sprint = num('sprint_speed')
    if (sprint !== undefined) push(bags, 'mobility_speed', sprint)
    const stamina = num('stamina')
    if (stamina !== undefined) push(bags, 'mobility_stamina', stamina)
    const light = num('light_melee_damage')
    if (light !== undefined) push(bags, 'melee_damage_flat', light)
    const heavy = num('heavy_melee_damage')
    if (heavy !== undefined) push(bags, 'melee_damage_flat', heavy)
    const techDur = num('tech_duration')
    if (techDur !== undefined) push(bags, 'tech_duration_mult', techDur)
    const techRange = num('tech_range')
    if (techRange !== undefined) push(bags, 'tech_range_mult', techRange)
    const health = num('max_health')
    if (health !== undefined) push(bags, 'health_flat', health)

    const scales = (hero.standard_level_up_upgrades ?? {}) as Record<string, unknown>
    const bullet = parseNum(scales.MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL)
    if (bullet !== undefined) push(bags, 'hero_scaling_scale', bullet)
  }
}

function collectSpiritScales(prop: ItemProperty, bags: Map<RosterFamily, number[]>): void {
  const scale = parseNum(prop.scale_function?.stat_scale)
  if (scale === undefined || scale <= 0) return
  push(bags, 'spirit_coeff', scale)
  const className = prop.scale_function?.class_name ?? ''
  const kind = css(prop)
  if (kind === 'melee_damage' || className.includes('melee')) {
    push(bags, 'spirit_coeff_melee', scale)
  }
  if (
    kind === 'tech_damage' ||
    kind === 'damage' ||
    kind === 'bullet_damage' ||
    className === 'scale_function_tech_damage'
  ) {
    push(bags, 'spirit_coeff_damage', scale)
  }
}

function collectProperty(
  name: string,
  prop: ItemProperty,
  bags: Map<RosterFamily, number[]>,
): void {
  collectSpiritScales(prop, bags)

  const raw = prop.value
  const value = parseNum(raw)
  if (value === undefined || isDummy(value, prop)) return

  const kind = css(prop)
  const lab = label(prop)
  const nm = name
  const blob = `${nm} ${lab} ${kind}`.toLowerCase()
  const pct = isPercent(prop, raw)
  const abs = Math.abs(value)
  const ppt = prop.provided_property_type ?? ''
  const scaleType = prop.scale_function?.specific_stat_scale_type ?? ''

  if (kind === 'cooldown') {
    push(bags, 'cooldown_s', value)
    return
  }
  if (kind === 'duration') {
    push(bags, 'duration_s', value)
    return
  }
  if (kind === 'fire_rate') {
    push(bags, 'fire_rate_pct', abs)
    return
  }
  if (kind === 'healing' && !pct) {
    push(bags, 'sustain_flat', value)
    return
  }
  if (
    (kind === 'healing' || /heal|lifesteal|regen/.test(blob)) &&
    pct
  ) {
    push(bags, 'sustain_pct', abs)
    return
  }
  if (
    kind === 'health' ||
    ppt === 'MODIFIER_VALUE_HEALTH_MAX' ||
    kind === 'combat_barrier' ||
    ppt === 'MODIFIER_VALUE_BARRIER_HEALTH'
  ) {
    if (!ppt.includes('REGEN') && !ppt.includes('LIFESTEAL')) {
      push(bags, 'health_flat', abs)
      return
    }
  }
  if (kind.includes('armor') || /resist/i.test(nm) || /resist/i.test(lab)) {
    push(bags, 'resist_pct', abs)
    return
  }
  if (kind === 'slow') {
    push(bags, 'cc_pct', abs)
    return
  }
  if (
    kind === 'radius' ||
    /radius/i.test(nm) ||
    /radius/i.test(lab) ||
    scaleType === 'ETechRadius'
  ) {
    push(bags, 'radius_m', abs)
    return
  }
  if (kind === 'range' || nm === 'AbilityCastRange') {
    push(bags, 'range_base_m', abs)
    push(bags, 'range_bonus_m', abs)
    return
  }
  if (
    kind === 'tech_damage' ||
    kind === 'bullet_damage' ||
    kind === 'damage' ||
    kind === 'melee_damage'
  ) {
    if (pct) push(bags, 'damage_pct', abs)
    else push(bags, 'damage_flat', abs)
  }
}

function collectItems(items: Json[], bags: Map<RosterFamily, number[]>): void {
  for (const item of items) {
    const type = String(item.type ?? '')
    if (type === 'weapon') {
      const info = (item.weapon_info ?? {}) as Json
      const radius = parseNum(info.bullet_radius)
      if (radius !== undefined) push(bags, 'radius_m', radius)
      continue
    }
    if (type !== 'ability' && type !== 'upgrade') continue
    const properties = (item.properties ?? {}) as Record<string, ItemProperty>
    for (const [name, prop] of Object.entries(properties)) {
      if (!prop || typeof prop !== 'object') continue
      collectProperty(name, prop, bags)
    }
  }
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  return sorted[Math.floor(sorted.length / 2)]!
}

function toBag(values: number[]): RosterFamilyBag {
  const sorted = values
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    p50: median(sorted),
    max: sorted[sorted.length - 1] ?? 0,
    values: sorted,
  }
}

async function main() {
  const [heroesRaw, itemsRaw] = await Promise.all([
    fetchJson(HEROES_URL),
    fetchJson(ITEMS_URL),
  ])
  const heroes = Array.isArray(heroesRaw) ? (heroesRaw as Json[]) : []
  const items = Array.isArray(itemsRaw) ? (itemsRaw as Json[]) : []
  if (heroes.length === 0 || items.length === 0) {
    throw new Error(
      `Unexpected assets payload (heroes=${heroes.length}, items=${items.length})`,
    )
  }

  const bags = new Map<RosterFamily, number[]>()
  collectHeroStats(heroes, bags)
  collectItems(items, bags)

  const families: Record<string, RosterFamilyBag> = {}
  for (const [family, values] of [...bags.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const bag = toBag(values)
    if (bag.n < MIN_ROSTER_SAMPLE) continue
    families[family] = bag
  }

  const out: RosterBaselinesFile = {
    generatedAt: new Date().toISOString(),
    source: { heroes: HEROES_URL, items: ITEMS_URL },
    minSampleSize: MIN_ROSTER_SAMPLE,
    families,
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8')

  const rows = Object.entries(families).map(
    ([name, bag]) =>
      `  ${name}: n=${bag.n} min=${bag.min} p50=${bag.p50} max=${bag.max}`,
  )
  console.log(`Wrote ${OUT_PATH}`)
  console.log(rows.join('\n'))
}

await main()
