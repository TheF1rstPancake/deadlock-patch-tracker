import { CareerBoard } from './CareerBoard.tsx'
import { PatternDetail } from './PatternDetail.tsx'
import { PatternHeatmap, PatternSearchForm } from './PatternHeatmap.tsx'
import { SiteNav } from './SiteNav.tsx'
import { loadAllPatches } from '../lib/loadPatches.ts'
import {
  ABSOLUTE_HEATMAP_LEGEND,
  CAREER_COUNTS_LEGEND,
  CAREER_EXTENT_HINT,
  CAREER_EXTENT_LEGEND,
  DEFAULT_CAREER_SORT,
  DEFAULT_HEATMAP_COLOR_MODE,
  DEFAULT_NET_BASIS,
  DEFAULT_PATTERN_CHART_MODE,
  DEFAULT_PATTERN_LENS,
  DEFAULT_PATTERN_SORT,
  OVERVIEW_PATCH_COLUMNS,
  OVERVIEW_TOP_ROWS,
  RECENT_VOLATILITY_HINT,
  RELATIVE_HEATMAP_LEGEND,
  buildCareerRows,
  buildEntityDetail,
  buildPatternMatrix,
  clipOverviewMatrix,
  uniqueMatch,
  type CareerSort,
  type HeatmapColorMode,
  type NetBasis,
  type PatternChartMode,
  type PatternLens,
  type PatternSort,
} from '../lib/patterns.ts'
import { careerHash, patternsHash, type PatternBoard, type PatternKind } from '../lib/route.ts'
import type { Patch } from '../types.ts'
import { useEffect, useMemo, useState } from 'react'

interface PatternsViewProps {
  kind: PatternKind
  slug?: string
  lens?: PatternLens
  focusPatchId?: string
  board?: PatternBoard
}

export function PatternsView({
  kind,
  slug,
  lens: routeLens,
  focusPatchId,
  board = 'heatmap',
}: PatternsViewProps) {
  const [patches, setPatches] = useState<Patch[] | null>(null)
  const [sort, setSort] = useState<PatternSort>(DEFAULT_PATTERN_SORT)
  const [query, setQuery] = useState('')
  const [chartMode, setChartMode] = useState<PatternChartMode>(DEFAULT_PATTERN_CHART_MODE)
  const [lens, setLens] = useState<PatternLens>(routeLens ?? DEFAULT_PATTERN_LENS)
  const [colorMode, setColorMode] = useState<HeatmapColorMode>(DEFAULT_HEATMAP_COLOR_MODE)
  const [showCumulative, setShowCumulative] = useState(false)
  const [netBasis, setNetBasis] = useState<NetBasis>(DEFAULT_NET_BASIS)
  const [careerSort, setCareerSort] = useState<CareerSort>(DEFAULT_CAREER_SORT)
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
    setChartMode(DEFAULT_PATTERN_CHART_MODE)
    setLens(routeLens ?? DEFAULT_PATTERN_LENS)
    setColorMode(DEFAULT_HEATMAP_COLOR_MODE)
    setShowCumulative(false)
    setAllRows(false)
    setAllPatches(false)
    setSort(DEFAULT_PATTERN_SORT)
  }, [kind, slug, routeLens, focusPatchId, board])

  useEffect(() => {
    setNetBasis(DEFAULT_NET_BASIS)
    setCareerSort(DEFAULT_CAREER_SORT)
  }, [board])

  const matrix = useMemo(() => {
    if (!patches) return null
    return buildPatternMatrix(patches, kind, { sort })
  }, [kind, patches, sort])

  const overview = useMemo(() => {
    if (!matrix) return null
    return clipOverviewMatrix(matrix, { allPatches, allRows, query, sort })
  }, [allPatches, allRows, matrix, query, sort])

  const detail = useMemo(() => {
    if (!patches || !slug) return undefined
    return buildEntityDetail(patches, kind, slug)
  }, [kind, patches, slug])

  const careerRows = useMemo(() => {
    if (!matrix || board !== 'career') return []
    return buildCareerRows(matrix, { basis: netBasis, sort: careerSort, query })
  }, [board, careerSort, matrix, netBasis, query])

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
  const rankedSort = sort !== 'name'
  const moreRows =
    rankedSort && !searching && matrix.entities.length > OVERVIEW_TOP_ROWS
  const morePatches = matrix.patches.length > OVERVIEW_PATCH_COLUMNS

  return (
    <div className="shell shell-patterns">
      <header className="masthead">
        <div className="masthead-top">
          <p className="kicker">
            {board === 'career' && !slug ? 'Balance · career net' : 'Balance · patterns'}
          </p>
          <SiteNav current="patterns" patternsKind={kind} />
        </div>
        <div className="masthead-row">
          <h1>{board === 'career' && !slug ? 'Career net' : 'Buff / nerf patterns'}</h1>
          <div className="chips pattern-board-tabs" role="tablist" aria-label="Patterns board">
            <a
              href={patternsHash(kind)}
              role="tab"
              aria-selected={!slug && board !== 'career'}
              className="chip"
            >
              Heatmap
            </a>
            <a
              href={careerHash(kind)}
              role="tab"
              aria-selected={!slug && board === 'career'}
              className="chip"
              title="Net board"
            >
              Career
            </a>
          </div>
        </div>
      </header>

      {slug ? (
        detail ? (
          <PatternDetail
            detail={detail}
            lens={lens}
            onLens={setLens}
            chartMode={chartMode}
            onChartMode={setChartMode}
            showCumulative={showCumulative}
            onToggleCumulative={setShowCumulative}
            focusPatchId={focusPatchId}
          />
        ) : (
          <p className="empty">
            No {kind} named <code>{slug}</code>.{' '}
            <a href={patternsHash(kind)}>Back to the heatmap</a>
            {' · '}
            <a href={careerHash(kind)}>Career net</a>.
          </p>
        )
      ) : (
        <>
          <div className="toolbar">
            <div className="chips" role="tablist" aria-label="Entity kind">
              <a
                href={board === 'career' ? careerHash('hero') : patternsHash('hero')}
                role="tab"
                aria-selected={kind === 'hero'}
                className="chip"
              >
                Heroes
              </a>
              <a
                href={board === 'career' ? careerHash('item') : patternsHash('item')}
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
          {board === 'career' ? (
            <>
              <div className="toolbar pattern-sort-bar">
                <div className="chips" role="radiogroup" aria-label="Lifetime net basis">
                  <button
                    type="button"
                    className="chip"
                    role="radio"
                    aria-checked={netBasis === 'counts'}
                    aria-pressed={netBasis === 'counts'}
                    title="Sum of buff lines minus nerf lines"
                    onClick={() => setNetBasis('counts')}
                  >
                    Counts
                  </button>
                  <button
                    type="button"
                    className="chip"
                    role="radio"
                    aria-checked={netBasis === 'extent'}
                    aria-pressed={netBasis === 'extent'}
                    title="Sum of signed approximate extent"
                    onClick={() => setNetBasis('extent')}
                  >
                    Extent
                  </button>
                </div>
                <div className="chips" role="group" aria-label="Sort career net">
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={careerSort === 'buffed'}
                    onClick={() => setCareerSort('buffed')}
                  >
                    Most buffed
                  </button>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={careerSort === 'nerfed'}
                    onClick={() => setCareerSort('nerfed')}
                  >
                    Most nerfed
                  </button>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={careerSort === 'name'}
                    onClick={() => setCareerSort('name')}
                  >
                    A–Z
                  </button>
                </div>
              </div>
              <p className="pattern-chart-peer-legend">{CAREER_EXTENT_HINT}</p>
              <CareerBoard rows={careerRows} basis={netBasis} kind={kind} />
              <p className="legend">
                <span className="legend-buff">+ buffed</span>
                <span className="legend-nerf">− nerfed</span>
                <span className="legend-empty">zero = even / untouched net</span>
              </p>
              <p className="pattern-heatmap-legend">
                {netBasis === 'extent' ? CAREER_EXTENT_LEGEND : CAREER_COUNTS_LEGEND}
              </p>
            </>
          ) : (
            <>
              <div className="toolbar pattern-sort-bar">
                <div className="chips" role="radiogroup" aria-label="Heatmap color">
                  <button
                    type="button"
                    className="chip"
                    role="radio"
                    aria-checked={colorMode === 'absolute'}
                    aria-pressed={colorMode === 'absolute'}
                    onClick={() => setColorMode('absolute')}
                  >
                    Absolute
                  </button>
                  <button
                    type="button"
                    className="chip"
                    role="radio"
                    aria-checked={colorMode === 'relative'}
                    aria-pressed={colorMode === 'relative'}
                    onClick={() => setColorMode('relative')}
                  >
                    Relative
                  </button>
                </div>
                <div className="chips" role="group" aria-label="Sort heatmap">
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={sort === 'name'}
                    onClick={() => setSort('name')}
                  >
                    A–Z
                  </button>
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
                colorMode={colorMode}
                rowMeta={sort === 'recent' ? 'recent' : 'total'}
                onSelect={(entity, patchId) =>
                  go(
                    patternsHash(
                      entity.kind,
                      entity.slug,
                      patchId ? { lens: 'day', patch: patchId } : undefined,
                    ),
                  )
                }
              />
              <p className="legend">
                <span className="legend-buff">buff</span>
                <span className="legend-nerf">nerf</span>
                <span className="legend-churn">churn (net 0, still touched)</span>
                <span className="legend-fix">· fix (not in net)</span>
                <span className="legend-empty">empty = no touch</span>
              </p>
              <p className="pattern-heatmap-legend">
                {colorMode === 'relative' ? RELATIVE_HEATMAP_LEGEND : ABSOLUTE_HEATMAP_LEGEND}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
