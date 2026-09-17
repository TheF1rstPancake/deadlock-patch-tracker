import { autoClarify } from './clarify.ts'
import { classifyLine, netSentiment } from './classify.ts'
import {
  buildCatalogIndex,
  isGenericSectionLabel,
  lookupName,
  lookupPrefix,
  looksLikeTargetName,
  type CatalogIndex,
} from './catalog.ts'
import { extractMetrics } from './metrics.ts'
import {
  detectLayout,
  hasBullet,
  parseBulletLines,
  splitSections,
  type ChangelogLayout,
} from './parseNews.ts'
import { slugifyName } from './slug.ts'
import type {
  ChangeEvent,
  ChangeTarget,
  HeroChange,
  HeroPatch,
  LineTag,
  ParseConfidence,
  Patch,
  TargetKind,
} from '../types.ts'

const HERO_SECTIONS = /hero/i
const ITEM_SECTIONS = /item/i
const SYSTEM_SECTIONS =
  /matchmaking|visual|shader|engine|performance|render|audio/i

export function kindFromSection(section: string): TargetKind | undefined {
  if (!section) return undefined
  if (HERO_SECTIONS.test(section)) return 'hero'
  if (ITEM_SECTIONS.test(section)) return 'item'
  if (SYSTEM_SECTIONS.test(section)) return 'system'
  return 'general'
}

export function facetFromText(text: string): string | undefined {
  const talent = text.match(
    /^((?:[A-Z][\w'’/-]*(?:\s+[A-Z][\w'’/-]*){0,5})(?:\s+T[1-3])?)\b/,
  )
  const name = talent?.[1]?.trim()
  if (!name || name.length < 3) return undefined
  if (
    /^(Fixed|Added|Removed|Increased|Reduced|Decreased|Now|The|This)\b/.test(
      name,
    )
  ) {
    return undefined
  }
  return name
}

/**
 * Resolve kind: roster/item/system catalog ≫ Heroes/Items section hint for
 * unknown names ≫ unknown. Flat lists have no section hint — never assume hero.
 * Catalog wins even inside `[ Heroes ]` so nested item lines are not projected
 * as hero cards.
 */
export function resolveTarget(
  rawName: string | undefined,
  text: string,
  section: string,
  index: CatalogIndex,
  lastHero?: ChangeTarget,
): ChangeTarget {
  const sectionKind = kindFromSection(section)
  const labeled = rawName?.trim()
  const catalogHit = labeled ? lookupName(labeled, index) : undefined
  const prefixHit = catalogHit
    ? undefined
    : lookupPrefix(labeled || text, index)
  const hit = catalogHit ?? prefixHit

  if (hit) {
    return withFacet(
      { kind: hit.kind, name: hit.name, slug: hit.slug },
      text,
      labeled,
    )
  }

  if (
    labeled &&
    lastHero &&
    sectionKind === 'hero' &&
    looksLikeTargetName(labeled)
  ) {
    return withFacet(
      {
        kind: 'hero',
        name: lastHero.name,
        slug: lastHero.slug,
        facet: labeled,
      },
      text,
      labeled,
    )
  }

  if (sectionKind === 'item' && labeled) {
    return withFacet(
      { kind: 'item', name: labeled, slug: slugifyName(labeled) },
      text,
      labeled,
    )
  }

  if (sectionKind === 'hero' && labeled && looksLikeTargetName(labeled)) {
    return withFacet(
      { kind: 'unknown', name: labeled, slug: slugifyName(labeled) },
      text,
      labeled,
    )
  }

  const fallbackKind = sectionKind === 'hero' ? 'general' : (sectionKind ?? 'unknown')
  const fallbackName =
    labeled && looksLikeTargetName(labeled)
      ? labeled
      : fallbackKind === 'unknown'
        ? labeled || 'Unknown'
        : section || 'General'
  return {
    kind: fallbackKind,
    name: fallbackName,
    slug: slugifyName(fallbackName),
  }
}

function withFacet(
  target: ChangeTarget,
  text: string,
  labeled?: string,
): ChangeTarget {
  if (target.facet) return target
  const facet = facetFromText(text)
  if (
    facet &&
    facet.toLowerCase() !== labeled?.toLowerCase() &&
    facet.toLowerCase() !== target.name.toLowerCase()
  ) {
    return { ...target, facet }
  }
  return target
}

export function parseConfidence(
  target: ChangeTarget,
  tag: LineTag,
  layout: ChangelogLayout,
  named: boolean,
  inCatalog: boolean,
): { confidence: ParseConfidence; needsReview: boolean } {
  if (layout === 'prose' || target.kind === 'unknown') {
    return { confidence: 'low', needsReview: true }
  }
  if ((target.kind === 'hero' || target.kind === 'item') && !inCatalog) {
    return { confidence: 'medium', needsReview: true }
  }
  if (!named && target.kind !== 'hero' && target.kind !== 'item') {
    if (tag === 'neutral') {
      return { confidence: 'medium', needsReview: true }
    }
    return { confidence: 'medium', needsReview: false }
  }
  if (tag === 'neutral') {
    return { confidence: 'medium', needsReview: false }
  }
  return { confidence: 'high', needsReview: false }
}

export interface BuildEventsInput {
  gid: string
  plain: string
  catalog?: CatalogIndex
}

export function buildEvents({
  gid,
  plain,
  catalog,
}: BuildEventsInput): {
  layout: ChangelogLayout
  sectionsPresent: string[]
  events: ChangeEvent[]
} {
  const index = catalog ?? buildCatalogIndex()
  const layout = detectLayout(plain)
  const sections = splitSections(plain)
  const sectionsPresent = sections
    .map((section) => section.name)
    .filter((name) => name.length > 0)

  const events: ChangeEvent[] = []
  if (layout === 'prose' && !hasBullet(plain)) {
    const raw = plain.trim()
    if (raw) {
      events.push(
        makeEvent({
          gid,
          n: 0,
          section: '',
          target: {
            kind: 'system',
            name: 'Patch notes',
            slug: 'patch-notes',
          },
          tag: classifyLine(raw),
          raw: raw.slice(0, 2000),
          named: false,
          layout,
          inCatalog: false,
        }),
      )
    }
    return { layout, sectionsPresent, events }
  }

  let n = 0
  let lastHero: ChangeTarget | undefined
  for (const section of sections) {
    if (kindFromSection(section.name) !== 'hero') lastHero = undefined
    const bullets = parseBulletLines(section.body, section.name)
    if (bullets.length === 0 && section.body.trim()) {
      continue
    }
    for (const bullet of bullets) {
      const labeled = sanitizeLabel(bullet.name, index)
      const changeText = labeled ? bullet.text : bullet.raw
      const target = resolveTarget(
        labeled,
        changeText,
        section.name,
        index,
        lastHero,
      )
      const catalogKind = lookupName(target.name, index)?.kind
      if (target.kind === 'hero' && catalogKind === 'hero') {
        lastHero = { kind: 'hero', name: target.name, slug: target.slug }
      }
      const tag = classifyLine(changeText)
      const metrics = extractMetrics(changeText)
      const auto = autoClarify(changeText)
      const inCatalog = Boolean(
        lookupName(target.name, index) ||
          (labeled && lookupName(labeled, index)),
      )
      events.push(
        makeEvent({
          gid,
          n: n++,
          section: section.name,
          target,
          tag,
          raw: changeText,
          display: auto.display,
          metrics: metrics.length > 0 ? metrics : undefined,
          named: Boolean(labeled),
          layout,
          inCatalog,
        }),
      )
    }
  }

  return { layout, sectionsPresent, events }
}

function sanitizeLabel(
  name: string | undefined,
  index: CatalogIndex,
): string | undefined {
  if (!name) return undefined
  if (isGenericSectionLabel(name)) return undefined
  if (lookupName(name, index)) return name
  if (looksLikeTargetName(name)) return name
  return undefined
}

function makeEvent(args: {
  gid: string
  n: number
  section: string
  target: ChangeTarget
  tag: LineTag
  raw: string
  display?: string
  metrics?: ChangeEvent['metrics']
  named: boolean
  layout: ChangelogLayout
  inCatalog: boolean
}): ChangeEvent {
  const parse = parseConfidence(
    args.target,
    args.tag,
    args.layout,
    args.named,
    args.inCatalog,
  )
  const event: ChangeEvent = {
    id: `${args.gid}:${args.n}`,
    section: args.section,
    target: args.target,
    tag: args.tag,
    raw: args.raw,
    parse: { ...parse, source: 'mechanical' },
  }
  if (args.display && args.display !== args.raw) {
    event.display = args.display
    event.clarified = true
  }
  if (args.metrics) event.metrics = args.metrics
  return event
}

export function projectHeroes(
  events: ChangeEvent[],
  previous?: Patch | null,
  preserve = true,
): HeroPatch[] {
  const prevByName = new Map(
    (previous?.heroes ?? []).map((hero) => [hero.name, hero]),
  )
  const catalog = buildCatalogIndex()
  const grouped = new Map<string, ChangeEvent[]>()
  for (const event of events) {
    if (event.target.kind !== 'hero') continue
    const catalogHit = lookupName(event.target.name, catalog)
    if (catalogHit?.kind !== 'hero') continue
    const name = catalogHit.name
    const list = grouped.get(name)
    if (list) list.push(event)
    else grouped.set(name, [event])
  }

  const heroes: HeroPatch[] = []
  for (const [name, heroEvents] of grouped) {
    const prev = preserve ? prevByName.get(name) : undefined
    const prevChanges = new Map(
      (prev?.changes ?? []).map((change) => [change.raw, change] as const),
    )
    const changes: HeroChange[] = heroEvents.map((event) => {
      const prior = prevChanges.get(event.raw)
      const change: HeroChange = {
        raw: event.raw,
        tag:
          preserve && prior?.override && prior.tag ? prior.tag : event.tag,
      }
      if (preserve && prior?.override) change.override = true
      const display = prior?.display ?? event.display
      if (display && display !== event.raw) {
        change.display = display
        change.clarified = true
      }
      return change
    })
    const sentiment =
      prev?.override && prev.sentiment
        ? prev.sentiment
        : netSentiment(changes.map((change) => change.tag))
    const hero: HeroPatch = { name, sentiment, changes }
    if (prev?.override) hero.override = true
    heroes.push(hero)
  }
  heroes.sort((a, b) => a.name.localeCompare(b.name))
  return heroes
}

export function applyPreviousEvents(
  events: ChangeEvent[],
  previous: Patch | null | undefined,
  preserve: boolean,
): ChangeEvent[] {
  if (!preserve || !previous) return events
  const priorByRaw = new Map<
    string,
    { event?: ChangeEvent; change?: HeroChange }
  >()
  for (const event of previous.events ?? []) {
    priorByRaw.set(`${event.target.name}::${event.raw}`, { event })
  }
  for (const hero of previous.heroes ?? []) {
    for (const change of hero.changes) {
      const key = `${hero.name}::${change.raw}`
      if (!priorByRaw.has(key)) priorByRaw.set(key, { change })
    }
  }

  return events.map((event) => {
    const prior = priorByRaw.get(`${event.target.name}::${event.raw}`)
    const prevEvent = prior?.event
    const prevChange = prior?.change
    const next: ChangeEvent = { ...event, parse: { ...event.parse } }
    if (
      prevEvent?.parse.source === 'cursor' ||
      prevEvent?.parse.source === 'manual'
    ) {
      next.parse.source = prevEvent.parse.source
    }
    const override = prevEvent?.override || prevChange?.override
    if (override) {
      next.override = true
      next.tag = prevEvent?.tag ?? prevChange?.tag ?? next.tag
    }
    const display = prevEvent?.display ?? prevChange?.display ?? next.display
    if (display && display !== next.raw) {
      next.display = display
      next.clarified = true
    }
    return next
  })
}
