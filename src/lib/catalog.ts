import catalogJson from '../../data/catalog.json'
import { slugifyName } from './slug.ts'
import type { TargetKind } from '../types.ts'

export interface CatalogEntry {
  kind: TargetKind
  name: string
  slug: string
}

export interface CatalogFile {
  schemaVersion: number
  source?: string
  heroes: Array<{ name: string; slug: string }>
  items: Array<{ name: string; slug: string }>
  systems: Array<{ name: string; slug: string; aliases?: string[] }>
  heroAliases?: Record<string, string>
}

interface PrefixRule {
  needle: string
  entry: CatalogEntry
}

const GENERIC_LABELS = new Set([
  'primary details',
  'other details',
  'additional details',
  'notes',
  'note',
  'misc',
  'miscellaneous',
  'example',
  'examples',
])

function asFile(raw: unknown): CatalogFile {
  return raw as CatalogFile
}

export function loadCatalog(
  data: CatalogFile = asFile(catalogJson),
): Map<string, CatalogEntry> {
  const byNorm = new Map<string, CatalogEntry>()

  const add = (kind: TargetKind, name: string, slug?: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = normalize(trimmed)
    if (byNorm.has(key)) return
    const entry: CatalogEntry = {
      kind,
      name: trimmed,
      slug: slug ?? slugifyName(trimmed),
    }
    byNorm.set(key, entry)
  }

  const aliasTo = (alias: string, entry: CatalogEntry) => {
    const key = normalize(alias)
    if (!byNorm.has(key)) byNorm.set(key, entry)
  }

  for (const hero of data.heroes) add('hero', hero.name, hero.slug)
  for (const item of data.items) add('item', item.name, item.slug)
  for (const system of data.systems) {
    add('system', system.name, system.slug)
    const entry = byNorm.get(normalize(system.name))
    if (!entry) continue
    for (const alias of system.aliases ?? []) aliasTo(alias, entry)
  }
  for (const [alias, canonical] of Object.entries(data.heroAliases ?? {})) {
    const canon = byNorm.get(normalize(canonical))
    if (canon) aliasTo(alias, canon)
  }

  return byNorm
}

export function buildCatalogIndex(
  input: CatalogFile | Map<string, CatalogEntry> | CatalogEntry[] = loadCatalog(),
) {
  let exact: Map<string, CatalogEntry>
  if (input instanceof Map) {
    exact = input
  } else if (Array.isArray(input)) {
    exact = new Map(input.map((entry) => [normalize(entry.name), entry]))
  } else {
    exact = loadCatalog(input)
  }

  const prefixes: PrefixRule[] = [...exact.entries()]
    .map(([needle, entry]) => ({ needle, entry }))
    .filter((rule) => rule.needle.length >= 3)
    .sort((a, b) => b.needle.length - a.needle.length)

  return { exact, prefixes }
}

export type CatalogIndex = ReturnType<typeof buildCatalogIndex>

export function lookupName(
  name: string,
  index: CatalogIndex,
): CatalogEntry | undefined {
  return index.exact.get(normalize(name))
}

export function lookupPrefix(
  text: string,
  index: CatalogIndex,
): CatalogEntry | undefined {
  const lower = normalize(text)
  for (const rule of index.prefixes) {
    if (!lower.startsWith(rule.needle)) continue
    const next = lower.charAt(rule.needle.length)
    if (next && !/[\s:'’.,;!?\-/]/.test(next) && next !== 's') continue
    return rule.entry
  }
  return undefined
}

export function isGenericSectionLabel(name: string): boolean {
  return GENERIC_LABELS.has(normalize(name))
}

export function looksLikeTargetName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 60) return false
  if (isGenericSectionLabel(trimmed)) return false
  if (/[.!?]/.test(trimmed)) return false
  if (
    /\b(?:increased|reduced|decreased|lowered|raised|fixed|added|removed|now|from|to|will|the|this|that)\b/i.test(
      trimmed,
    )
  ) {
    return false
  }
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 6) return false
  return true
}

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/['’]/g, "'")
}
