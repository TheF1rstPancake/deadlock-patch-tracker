import { PatternDetail } from './PatternDetail.tsx'
import { PatternHeatmap, PatternSearchForm } from './PatternHeatmap.tsx'
import { SiteNav } from './SiteNav.tsx'
import { loadAllPatches } from '../lib/loadPatches.ts'
import {
  DEFAULT_PATTERN_SORT,
  OVERVIEW_PATCH_COLUMNS,
  OVERVIEW_TOP_ROWS,
  RECENT_VOLATILITY_HINT,
  buildEntityDetail,
  buildPatternMatrix,
  clipOverviewMatrix,
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
  const [sort, setSort] = useState<PatternSort>(DEFAULT_PATTERN_SORT)
  const [query, setQuery] = useState('')
  const [showCumulative, setShowCumulative] = useState(false)
  const [allRows, setAllRows] = useState(false)
  const [allPatches, setAllPatches] = useState(false)

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
    setAllRows(false)
    setAllPatches(false)
  }, [kind, slug])

  const matrix = useMemo(() => {
    if (!patches) return null
    return buildPatternMatrix(patches, kind, { sort })
  }, [kind, patches, sort])

  const overview = useMemo(() => {
    if (!matrix) return null
    return clipOverviewMatrix(matrix, { allPatches, allRows, query })
  }, [allPatches, allRows, matrix, query])

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

  if (!patches || !matrix || !overview) {
    return (
      <div className="shell shell-patterns">
        <p className="empty">Loading patterns…</p>
      </div>
    )
  }

  const searching = query.trim().length > 0
  const moreRows = !searching && matrix.entities.length > OVERVIEW_TOP_ROWS
  const morePatches = matrix.patches.length > OVERVIEW_PATCH_COLUMNS

  return (
    <div className="shell shell-patterns">
      <header className="masthead">
        <div className="masthead-top">
          <p className="kicker">Balance · patterns</p>
          <SiteNav current="patterns" patternsKind={kind} />
        </div>
        <h1>Buff / nerf patterns</h1>
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
                aria-pressed={sort === 'recent'}
                aria-description={RECENT_VOLATILITY_HINT}
                onClick={() => setSort('recent')}
              >
                Recent volatility
                <span className="chip-help" title={RECENT_VOLATILITY_HINT} aria-hidden="true">
                  ?
                </span>
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={sort === 'total'}
                onClick={() => setSort('total')}
              >
                Total touches
              </button>
            </div>
            <div className="chips" role="group" aria-label="Heatmap window">
              {morePatches ? (
                <button
                  type="button"
                  className="chip"
                  aria-pressed={allPatches}
                  onClick={() => setAllPatches((on) => !on)}
                >
                  All patches
                  <span className="chip-count">{matrix.patches.length}</span>
                </button>
              ) : null}
              {moreRows ? (
                <button
                  type="button"
                  className="chip"
                  aria-pressed={allRows}
                  onClick={() => setAllRows((on) => !on)}
                >
                  Show all
                  <span className="chip-count">{matrix.entities.length}</span>
                </button>
              ) : null}
            </div>
          </div>
          <PatternHeatmap
            matrix={overview}
            rowMeta={sort === 'recent' ? 'recent' : 'total'}
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
