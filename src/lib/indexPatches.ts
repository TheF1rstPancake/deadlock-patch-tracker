import { netSentiment } from './classify.ts'
import { slugifyName } from './slug.ts'
import type {
  HistoryIndex,
  HistoryPatchSummary,
  HistoryTarget,
  HistoryTargetTouch,
  LineTag,
  Patch,
  TargetKind,
} from '../types.ts'

const KIND_COUNTS: TargetKind[] = [
  'hero',
  'item',
  'general',
  'system',
  'unknown',
]

export function buildHistoryIndex(
  patches: Patch[],
  generatedAt = new Date().toISOString(),
): HistoryIndex {
  const sorted = [...patches].sort((a, b) => b.date.localeCompare(a.date))
  const summaries: HistoryPatchSummary[] = sorted.map((patch) => {
    const counts = {
      events: patch.events.length,
      hero: 0,
      item: 0,
      general: 0,
      system: 0,
      unknown: 0,
      needsReview: 0,
    }
    for (const event of patch.events) {
      counts[event.target.kind] += 1
      if (event.parse.needsReview) counts.needsReview += 1
    }
    return {
      id: patch.id,
      date: patch.date,
      title: patch.title,
      gid: patch.gid,
      layout: patch.layout,
      counts,
    }
  })

  const targets = new Map<string, HistoryTarget>()
  // Chronological (oldest first) so touches read as history.
  const chrono = [...sorted].sort((a, b) => a.date.localeCompare(b.date))
  for (const patch of chrono) {
    const byKey = new Map<string, { tags: LineTag[]; eventIds: string[] }>()
    for (const event of patch.events) {
      if (event.target.kind === 'unknown') continue
      const slug = event.target.slug ?? slugifyName(event.target.name)
      const key = `${event.target.kind}:${slug}`
      const bucket = byKey.get(key)
      if (bucket) {
        bucket.tags.push(event.tag)
        bucket.eventIds.push(event.id)
      } else {
        byKey.set(key, { tags: [event.tag], eventIds: [event.id] })
      }
      if (!targets.has(key)) {
        targets.set(key, {
          kind: event.target.kind,
          name: event.target.name,
          slug,
          touches: [],
          totals: { buff: 0, nerf: 0, fix: 0, neutral: 0 },
        })
      } else {
        const existing = targets.get(key)!
        if (existing.name.length < event.target.name.length) {
          existing.name = event.target.name
        }
      }
    }
    for (const [key, bucket] of byKey) {
      const target = targets.get(key)!
      const tagSummary = netSentiment(bucket.tags)
      const touch: HistoryTargetTouch = {
        patchId: patch.id,
        tagSummary,
        eventIds: bucket.eventIds,
      }
      target.touches.push(touch)
      for (const tag of bucket.tags) {
        if (tag === 'buff' || tag === 'nerf' || tag === 'fix' || tag === 'neutral') {
          target.totals[tag] += 1
        }
      }
    }
  }

  const ordered = Object.fromEntries(
    [...targets.entries()].sort((a, b) => {
      if (a[1].kind !== b[1].kind) {
        return KIND_COUNTS.indexOf(a[1].kind) - KIND_COUNTS.indexOf(b[1].kind)
      }
      return a[1].name.localeCompare(b[1].name)
    }),
  )

  return {
    schemaVersion: 1,
    generatedAt,
    patches: summaries,
    targets: ordered,
  }
}
