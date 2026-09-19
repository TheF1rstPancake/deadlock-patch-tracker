import { HeroPortrait } from './HeroPortrait.tsx'
import { PatchEventPanel } from './PatchEventPanel.tsx'
import {
  chartEncodingLegend,
  chartLeftAxisTitle,
  chartRightAxisTitle,
  chartUsesDualAxis,
  compactPatchLabel,
  cumulativeBasisLabel,
  eventsForBar,
  formatDirectionLabel,
  formatRankMark,
  formatSignedValue,
  formatTotalsLine,
  hardestHitsFromSeries,
  ranksForLens,
  seriesCumulativeValues,
  type BarSide,
  type DirectionRank,
  type HardestHit,
  type NetBasis,
  type PatternChartMode,
  type PatternEntityDetail,
  type PatternLens,
  type PatternSeriesPoint,
} from '../lib/patterns.ts'
import { careerHash, patternsHash } from '../lib/route.ts'
import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'

interface PatternDetailProps {
  detail: PatternEntityDetail
  lens: PatternLens
  onLens: (lens: PatternLens) => void
  chartMode: PatternChartMode
  onChartMode: (mode: PatternChartMode) => void
  showCumulative: boolean
  onToggleCumulative: (next: boolean) => void
  cumulativeBasis: NetBasis
  onCumulativeBasis: (basis: NetBasis) => void
  focusPatchId?: string
}

interface OpenBar {
  patchId: string
  side: BarSide
}

export function PatternDetail({
  detail,
  lens,
  onLens,
  chartMode,
  onChartMode,
  showCumulative,
  onToggleCumulative,
  cumulativeBasis,
  onCumulativeBasis,
  focusPatchId,
}: PatternDetailProps) {
  const kindLabel = detail.kind === 'hero' ? 'Hero' : 'Item'
  const backHref = patternsHash(detail.kind)
  const [openBar, setOpenBar] = useState<OpenBar | null>(null)
  const closePanel = useCallback(() => setOpenBar(null), [])
  const hits = useMemo(
    () => hardestHitsFromSeries(detail.series, lens),
    [detail.series, lens],
  )

  const selected = openBar
    ? detail.series.find((point) => point.patchId === openBar.patchId)
    : undefined
  const listed = selected ? eventsForBar(selected.events, openBar!.side) : []
  const percentileLabel = selected
    ? drawerRankLabel(selected, openBar!.side, lens)
    : ''

  const selectLens = (next: PatternLens) => {
    onLens(next)
    onChartMode('percentile')
  }

  const selectCumulative = (basis: NetBasis) => {
    if (showCumulative && cumulativeBasis === basis) {
      onToggleCumulative(false)
      return
    }
    onCumulativeBasis(basis)
    onToggleCumulative(true)
  }

  return (
    <section className="pattern-detail" aria-label={`${detail.name} pattern`}>
      <p className="pattern-back">
        <a href={backHref}>← {detail.kind === 'hero' ? 'Heroes' : 'Items'} heatmap</a>
        <span className="pattern-back-sep" aria-hidden="true">
          ·
        </span>
        <a href={careerHash(detail.kind)}>Career net</a>
      </p>
      <header className="pattern-detail-head">
        {detail.kind === 'hero' ? <HeroPortrait name={detail.name} /> : (
          <div className="monogram" aria-hidden="true">
            {detail.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <p className="kicker">{kindLabel}</p>
          <h2>{detail.name}</h2>
          <p className="pattern-detail-totals">
            {formatTotalsLine(detail.totals)}
            <span className="pattern-detail-touches">
              {' '}
              · {detail.totalTouches} buff+nerf touches
            </span>
          </p>
        </div>
      </header>
      <div className="toolbar pattern-chart-toolbar">
        <div className="chips" role="radiogroup" aria-label="Percentile lens">
          <button
            type="button"
            className="chip"
            role="radio"
            aria-checked={lens === 'across'}
            aria-pressed={lens === 'across'}
            title="Percentile among every same-kind same-sign touch in the ledger"
            onClick={() => selectLens('across')}
          >
            Across patches
          </button>
          <button
            type="button"
            className="chip"
            role="radio"
            aria-checked={lens === 'day'}
            aria-pressed={lens === 'day'}
            title="Percentile among same-kind same-sign peers that patch"
            onClick={() => selectLens('day')}
          >
            That day
          </button>
        </div>
        <button
          type="button"
          className="chip"
          aria-pressed={chartMode === 'counts'}
          title="Event line counts that patch, not how hard"
          onClick={() =>
            onChartMode(chartMode === 'counts' ? 'percentile' : 'counts')
          }
        >
          Counts
        </button>
        <div className="chips" role="radiogroup" aria-label="Cumulative net">
          <button
            type="button"
            className="chip"
            role="radio"
            aria-checked={showCumulative && cumulativeBasis === 'counts'}
            aria-pressed={showCumulative && cumulativeBasis === 'counts'}
            title="Running signed net of buff lines minus nerf lines"
            onClick={() => selectCumulative('counts')}
          >
            {cumulativeBasisLabel('counts')}
          </button>
          <button
            type="button"
            className="chip"
            role="radio"
            aria-checked={showCumulative && cumulativeBasis === 'extent'}
            aria-pressed={showCumulative && cumulativeBasis === 'extent'}
            title="Running signed approximate extent (buff minus nerf)"
            onClick={() => selectCumulative('extent')}
          >
            {cumulativeBasisLabel('extent')}
          </button>
        </div>
      </div>
      <p className="pattern-chart-peer-legend">
        {chartEncodingLegend(
          chartMode,
          detail.kind,
          lens,
          showCumulative,
          cumulativeBasis,
        )}
      </p>
      <BuffNerfChart
        series={detail.series}
        mode={chartMode}
        lens={lens}
        showCumulative={showCumulative}
        cumulativeBasis={cumulativeBasis}
        openBar={openBar}
        onOpenBar={setOpenBar}
        focusPatchId={focusPatchId}
      />
      <HardestHitsList
        hits={hits}
        lens={lens}
        openBar={openBar}
        onOpenBar={setOpenBar}
      />
      <PatchEventPanel
        open={Boolean(openBar && selected)}
        title={
          selected
            ? `${detail.name} · ${selected.date}`
            : detail.name
        }
        side={openBar?.side ?? 'all'}
        percentileLabel={percentileLabel}
        events={listed}
        onClose={closePanel}
      />
    </section>
  )
}

function HardestHitsList({
  hits,
  lens,
  openBar,
  onOpenBar,
}: {
  hits: HardestHit[]
  lens: PatternLens
  openBar: OpenBar | null
  onOpenBar: (next: OpenBar | null) => void
}) {
  if (hits.length === 0) return null
  const lensNote = lens === 'across' ? 'across the ledger' : 'that day'
  return (
    <section className="pattern-hardest" aria-label={`Hardest hits ${lensNote}`}>
      <h3>
        Hardest hits
        <span className="pattern-hardest-lens">{lensNote}</span>
      </h3>
      <ol className="pattern-hardest-list">
        {hits.map((hit) => {
          const open =
            openBar?.patchId === hit.patchId && openBar.side === hit.side
          return (
            <li key={`${hit.patchId}-${hit.side}`}>
              <button
                type="button"
                className={`pattern-hardest-item${open ? ' is-open' : ''}`}
                aria-pressed={open}
                onClick={() =>
                  onOpenBar(open ? null : { patchId: hit.patchId, side: hit.side })
                }
              >
                <span className="pattern-hardest-date">
                  {compactPatchLabel(hit.date)}
                </span>
                <span className={`pattern-hardest-side is-${hit.side}`}>
                  {hit.side}
                </span>
                <span className="pattern-hardest-mark">
                  {formatRankMark(hit.rank)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function BuffNerfChart({
  series,
  mode,
  lens,
  showCumulative,
  cumulativeBasis,
  openBar,
  onOpenBar,
  focusPatchId,
}: {
  series: PatternSeriesPoint[]
  mode: PatternChartMode
  lens: PatternLens
  showCumulative: boolean
  cumulativeBasis: NetBasis
  openBar: OpenBar | null
  onOpenBar: (next: OpenBar | null) => void
  focusPatchId?: string
}) {
  const clipId = useId().replace(/:/g, '')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const percentileMode = mode === 'percentile'
  const dualAxis = chartUsesDualAxis(mode, showCumulative, cumulativeBasis)
  const leftTitle = chartLeftAxisTitle(mode)
  const rightTitle = showCumulative ? chartRightAxisTitle(cumulativeBasis) : null
  const values = series.map((point) => {
    if (!percentileMode) return { up: point.counts.buff, down: point.counts.nerf }
    const ranks = ranksForLens(point, lens)
    return {
      up: ranks.buff?.percentile ?? 0,
      down: ranks.nerf?.percentile ?? 0,
    }
  })
  const barMax = percentileMode
    ? 100
    : Math.max(
        1,
        Math.ceil(Math.max(1, ...values.map((value) => Math.max(value.up, value.down)))),
      )
  const cumulatives = seriesCumulativeValues(series, cumulativeBasis)
  const cumMax = Math.max(1, ...cumulatives.map((value) => Math.abs(value)))
  const sharedMax =
    showCumulative && !dualAxis ? Math.max(barMax, cumMax) : barMax
  const maxAbs = sharedMax
  const maxAbsCum = dualAxis ? cumMax : sharedMax
  const groupW = 42
  const pad = { top: 28, right: dualAxis ? 58 : 14, bottom: 36, left: 46 }
  const plotH = 220
  const width = pad.left + pad.right + series.length * groupW
  const height = pad.top + pad.bottom + plotH
  const zeroY = pad.top + plotH / 2
  const barW = 10
  const halfH = plotH / 2

  const valueY = (value: number) => zeroY - (value / maxAbs) * halfH
  const cumY = (value: number) => zeroY - (value / maxAbsCum) * halfH

  const line = cumulatives
    .map((value, index) => {
      const x = pad.left + index * groupW + groupW / 2
      const y = cumY(value)
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`
    })
    .join(' ')

  const ticks = [1, 0.5, 0, -0.5, -1]
  const ariaLabel = [
    percentileMode
      ? lens === 'across'
        ? 'Per-patch buff and nerf percentiles versus every same-kind same-sign touch in the ledger, buffs above zero, nerfs below.'
        : 'Per-patch buff and nerf percentiles versus same-direction peers that day, buffs above zero, nerfs below.'
      : 'Per-patch buff and nerf event counts, buffs above zero, nerfs below.',
    `Left axis: ${leftTitle}.`,
    rightTitle ? `Right axis: ${rightTitle}.` : '',
    'Click a bar for the lines in it.',
  ]
    .filter(Boolean)
    .join(' ')

  const toggle = (patchId: string, side: BarSide) => {
    onOpenBar(
      openBar && openBar.patchId === patchId && openBar.side === side
        ? null
        : { patchId, side },
    )
  }

  useEffect(() => {
    const targetId = openBar?.patchId ?? focusPatchId
    if (!targetId) return
    const node = document.querySelector(
      `[data-patch-id="${CSS.escape(targetId)}"]`,
    )
    node?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [openBar, focusPatchId])

  const hovered = hoverId
    ? series.find((point) => point.patchId === hoverId)
    : openBar
      ? series.find((point) => point.patchId === openBar.patchId)
      : undefined

  return (
    <div className="pattern-chart-frame">
      <span className="pattern-chart-y-title pattern-chart-y-title-left" data-axis="left">
        {leftTitle}
      </span>
      <div className="pattern-chart-scroll">
      <svg
        className="pattern-chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <clipPath id={`plot-${clipId}`}>
            <rect x={pad.left} y={pad.top} width={series.length * groupW} height={plotH} />
          </clipPath>
        </defs>
        <rect
          className="pattern-chart-band-buff"
          x={pad.left}
          y={pad.top}
          width={series.length * groupW}
          height={halfH}
        />
        <rect
          className="pattern-chart-band-nerf"
          x={pad.left}
          y={zeroY}
          width={series.length * groupW}
          height={halfH}
        />
        {ticks.map((tick) => {
          const value = maxAbs * tick
          const y = valueY(value)
          return (
            <g key={`grid-${tick}`}>
              <line
                className={tick === 0 ? 'pattern-chart-zero' : 'pattern-chart-grid'}
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
              />
              <text
                className={`pattern-chart-axis${tick > 0 ? ' pattern-chart-axis-pos' : ''}${tick < 0 ? ' pattern-chart-axis-neg' : ''}${tick === 0 ? ' pattern-chart-axis-zero' : ''}`}
                x={pad.left - 6}
                y={y + 3}
                textAnchor="end"
              >
                {formatAxisValue(value)}
              </text>
            </g>
          )
        })}
        {series.map((point, index) => {
          const x0 = pad.left + index * groupW
          const pair = values[index]!
          const buffH = (pair.up / maxAbs) * halfH
          const nerfH = (pair.down / maxAbs) * halfH
          const label = compactPatchLabel(point.date)
          const fixDots = Math.min(point.counts.fix, 3)
          const selected = openBar?.patchId === point.patchId
          const onGroupKey = (event: KeyboardEvent<SVGGElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle(point.patchId, 'all')
            }
          }
          return (
            <g
              key={point.patchId}
              data-patch-id={point.patchId}
              className={`pattern-bar-group${selected ? ' is-open' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`${point.date}: ${pointTooltip(point, mode, lens)}. Open line details.`}
              onFocus={() => setHoverId(point.patchId)}
              onBlur={() => setHoverId((id) => (id === point.patchId ? null : id))}
              onMouseEnter={() => setHoverId(point.patchId)}
              onMouseLeave={() => setHoverId((id) => (id === point.patchId ? null : id))}
              onKeyDown={onGroupKey}
            >
              <title>
                {pointTooltip(point, mode, lens)}
              </title>
              <rect
                className="pattern-bar-hit"
                x={x0}
                y={pad.top}
                width={groupW}
                height={plotH}
                onClick={() => toggle(point.patchId, 'all')}
              />
              <rect
                className="pattern-bar-buff"
                x={x0 + 8}
                y={valueY(pair.up)}
                width={barW}
                height={Math.max(buffH, pair.up > 0 ? 2 : 0)}
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(point.patchId, 'buff')
                }}
              />
              <rect
                className="pattern-bar-nerf"
                x={x0 + 20}
                y={zeroY}
                width={barW}
                height={Math.max(nerfH, pair.down > 0 ? 2 : 0)}
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(point.patchId, 'nerf')
                }}
              />
              {Array.from({ length: fixDots }, (_, dot) => (
                <circle
                  key={dot}
                  className="pattern-fix-dot"
                  cx={x0 + groupW / 2 + (dot - (fixDots - 1) / 2) * 5}
                  cy={pad.top - 7}
                  r={2.2}
                />
              ))}
              <text
                className="pattern-chart-col"
                x={x0 + groupW / 2}
                y={height - 8}
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          )
        })}
        {showCumulative ? (
          <g clipPath={`url(#plot-${clipId})`}>
            <path className="pattern-cum-line" d={line} fill="none" />
            {series.map((point, index) => (
              <circle
                key={`cum-${point.patchId}`}
                className="pattern-cum-dot"
                cx={pad.left + index * groupW + groupW / 2}
                cy={cumY(cumulatives[index] ?? 0)}
                r={2.4}
              />
            ))}
          </g>
        ) : null}
        {dualAxis ? (
          <>
            <text
              className="pattern-chart-axis pattern-chart-axis-gold"
              x={width - 6}
              y={cumY(maxAbsCum) + 3}
              textAnchor="end"
            >
              {formatSignedValue(maxAbsCum, cumulativeBasis)}
            </text>
            <text
              className="pattern-chart-axis pattern-chart-axis-gold"
              x={width - 6}
              y={cumY(-maxAbsCum) + 3}
              textAnchor="end"
            >
              {formatSignedValue(-maxAbsCum, cumulativeBasis)}
            </text>
          </>
        ) : null}
        {hovered ? (
          <text
            className="pattern-hover-pct"
            x={pad.left + series.findIndex((point) => point.patchId === hovered.patchId) * groupW + groupW / 2}
            y={pad.top - 12}
            textAnchor="middle"
          >
            {hoverRankText(
              hovered,
              mode,
              lens,
              showCumulative,
              cumulatives[series.findIndex((point) => point.patchId === hovered.patchId)] ?? 0,
              cumulativeBasis,
            )}
          </text>
        ) : null}
      </svg>
      </div>
      {rightTitle ? (
        <span className="pattern-chart-y-title pattern-chart-y-title-right" data-axis="right">
          {rightTitle}
        </span>
      ) : null}
    </div>
  )
}

function ranksOnPoint(
  point: PatternSeriesPoint,
  lens: PatternLens,
): DirectionRank[] {
  const ranks = ranksForLens(point, lens)
  return [ranks.buff, ranks.nerf].filter((rank): rank is DirectionRank =>
    Boolean(rank),
  )
}

function drawerRankLabel(
  point: PatternSeriesPoint,
  side: BarSide,
  lens: PatternLens,
): string {
  const ranks = ranksForLens(point, lens)
  if (side === 'buff') {
    return ranks.buff ? formatDirectionLabel(ranks.buff) : 'no buff that patch'
  }
  if (side === 'nerf') {
    return ranks.nerf ? formatDirectionLabel(ranks.nerf) : 'no nerf that patch'
  }
  const listed = ranksOnPoint(point, lens)
  return listed.length > 0
    ? listed.map(formatDirectionLabel).join(' · ')
    : 'no buff/nerf that patch'
}

function hoverRankText(
  point: PatternSeriesPoint,
  mode: PatternChartMode,
  lens: PatternLens,
  showCumulative = false,
  cumulative = 0,
  cumulativeBasis: NetBasis = 'counts',
): string {
  const head =
    mode === 'counts'
      ? `${point.counts.buff}↑ ${point.counts.nerf}↓`
      : (() => {
          const ranks = ranksOnPoint(point, lens)
          if (ranks.length === 0) return point.counts.fix ? 'fix only' : 'no rank'
          return ranks.map(formatDirectionLabel).join(' · ')
        })()
  if (!showCumulative) return head
  return `${head} · cum ${formatSignedValue(cumulative, cumulativeBasis)}`
}

function formatAxisValue(value: number): string {
  const rounded = Math.round(Math.abs(value))
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${rounded}`
}

function formatExtent(value: number): string {
  if (value === 0) return '0%'
  const body = value >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${body.replace(/\.0$/, '')}%`
}

function approxExtentText(point: PatternSeriesPoint): string {
  const bits: string[] = []
  if (point.extent.buff > 0) bits.push(`+${formatExtent(point.extent.buff)} buff`)
  if (point.extent.nerf > 0) bits.push(`−${formatExtent(point.extent.nerf)} nerf`)
  if (bits.length === 0) return ''
  return `approx. ${bits.join(', ')} extent`
}

function pointTooltip(
  point: PatternSeriesPoint,
  mode: PatternChartMode,
  lens: PatternLens,
): string {
  if (mode === 'counts') {
    return [
      `${point.date}: ${point.counts.buff} buff, ${point.counts.nerf} nerf`,
      point.counts.fix ? `${point.counts.fix} fix` : '',
      point.counts.neutral ? `${point.counts.neutral} other` : '',
    ]
      .filter(Boolean)
      .join(', ')
  }
  const ranks = ranksOnPoint(point, lens)
  const rankText = ranks.length
    ? ranks.map(formatDirectionLabel).join(' · ')
    : 'no buff/nerf rank'
  const extent = approxExtentText(point)
  return [point.date, rankText, extent].filter(Boolean).join(' · ')
}
