import { PatternDetail } from './PatternDetail.tsx'
import { PatternHeatmap, PatternSearchForm } from './PatternHeatmap.tsx'
import { SiteNav } from './SiteNav.tsx'
import { loadAllPatches } from '../lib/loadPatches.ts'
import {
  RECENT_PATCH_WINDOW,
  buildEntityDetail,
  buildPatternMatrix,
  uniqueMatch,
  type PatternSort,
} from '../lib/patterns.ts'
import { patternsHash, type PatternKind } from '../lib/route.ts'
import type { Patch } from '../types.ts'
import { useEffect, useMemo, useState } from 'react'

interface PatternsViewProps {
  kind: PatternKind
  slug?: string
}

export function PatternsView({ kind, slug }: PatternsViewProps) {
  const [patches, setPatches] = useState<Patch[] | null>(null)
  const [sort, setSort] = useState<PatternSort>('total')
  const [query, setQuery] = useState('')
  const [showCumulative, setShowCumulative] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadAllPatches().then((all) => {
      if (!cancelled) setPatches(all)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setQuery('')
    setShowCumulative(false)
  }, [kind, slug])

  const matrix = useMemo(() => {
    if (!patches) return null
    return buildPatternMatrix(patches, kind, { sort })
  }, [kind, patches, sort])

  const detail = useMemo(() => {
    if (!patches || !slug) return undefined
    return buildEntityDetail(patches, kind, slug)
  }, [kind, patches, slug])

  const go = (hash: string) => {
    window.location.hash = hash.replace(/^#/, '')
  }

  const submitMatch = () => {
    if (!matrix) return
    const match = uniqueMatch(matrix.entities, query)
    if (match) go(patternsHash(match.kind, match.slug))
  }

  if (!patches || !matrix) {
    return (
      <div className="shell shell-patterns">
        <p className="empty">Loading patterns…</p>
      </div>
    )
  }

  return (
    <div className="shell shell-patterns">
      <header className="masthead">
        <div className="masthead-top">
          <p className="kicker">Balance · patterns</p>
          <SiteNav current="patterns" patternsKind={kind} />
        </div>
        <h1>Buff / nerf patterns</h1>
        <p className="lede">
          {slug
            ? 'Per-patch buff vs nerf event counts. Cumulative net is optional and off by default.'
            : `${kind === 'hero' ? 'Heroes' : 'Items'} across ${matrix.patches.length} ingested patches. Color is signed net (buffs − nerfs). The number is touch volume so canceling churn still shows. Empty cells were not touched that patch — not a gray zero.`}
        </p>
      </header>

      {slug ? (
        detail ? (
          <PatternDetail
            detail={detail}
            showCumulative={showCumulative}
            onToggleCumulative={setShowCumulative}
          />
        ) : (
          <p className="empty">
            No {kind} named <code>{slug}</code>.{' '}
            <a href={patternsHash(kind)}>Back to the heatmap</a>.
          </p>
        )
      ) : (
        <>
          <div className="toolbar">
            <div className="chips" role="tablist" aria-label="Entity kind">
              <a
                href={patternsHash('hero')}
                role="tab"
                aria-selected={kind === 'hero'}
                className="chip"
              >
                Heroes
              </a>
              <a
                href={patternsHash('item')}
                role="tab"
                aria-selected={kind === 'item'}
                className="chip"
              >
                Items
              </a>
            </div>
            <PatternSearchForm
              query={query}
              onQuery={setQuery}
              onSubmitMatch={submitMatch}
              kind={kind}
            />
          </div>
          <div className="toolbar pattern-sort-bar">
            <div className="chips" role="group" aria-label="Sort heatmap">
              <button
                type="button"
                className="chip"
                aria-pressed={sort === 'total'}
                onClick={() => setSort('total')}
              >
                Total touches
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={sort === 'recent'}
                onClick={() => setSort('recent')}
              >
                Recent volatility
              </button>
            </div>
            <p className="pattern-sort-note">
              Default sort is total buff+nerf events. Recent volatility counts
              those events in the last {RECENT_PATCH_WINDOW} ingested patches
              (not a 30-day window).
            </p>
          </div>
          <PatternHeatmap
            matrix={matrix}
            query={query}
            onSelect={(entity) => go(patternsHash(entity.kind, entity.slug))}
          />
          <p className="legend">
            <span className="legend-buff">buff net</span>
            <span className="legend-nerf">nerf net</span>
            <span className="legend-churn">churn (net 0, still touched)</span>
            <span className="legend-fix">· fix (not in net)</span>
            <span className="legend-empty">empty = no touch</span>
          </p>
        </>
      )}
    </div>
  )
}
