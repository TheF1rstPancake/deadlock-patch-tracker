import { HeroPortrait } from './HeroPortrait.tsx'
import { PatchEventPanel } from './PatchEventPanel.tsx'
import {
  compactPatchLabel,
  eventsForBar,
  formatPercentileLabel,
  formatTotalsLine,
  MIN_PEER_SAMPLE,
  type BarSide,
  type PatternChartMode,
  type PatternEntityDetail,
  type PatternSeriesPoint,
  type PeerBand,
} from '../lib/patterns.ts'
import { patternsHash } from '../lib/route.ts'
import { useCallback, useId, useState, type KeyboardEvent } from 'react'

interface PatternDetailProps {
  detail: PatternEntityDetail
  chartMode: PatternChartMode
  onChartMode: (mode: PatternChartMode) => void
  showCumulative: boolean
  onToggleCumulative: (next: boolean) => void
}

const COUNTS_NOTE =
  'Buffs plot above zero, nerfs below. Click a bar (or the patch group) for the lines in it. Fixes stay dots, not bar height. Faint band = peer median→P90 that patch among other heroes or items — same units as the Y scale.'

const EXTENT_CALLOUT =
  'Extent is approximate — summed relative % from each line’s parsed from→to metrics, with a small stand-in when a line has no numbers. Not win-rate or external balance data.'

interface OpenBar {
  patchId: string
  side: BarSide
}

export function PatternDetail({
  detail,
  chartMode,
  onChartMode,
  showCumulative,
  onToggleCumulative,
}: PatternDetailProps) {
  const kindLabel = detail.kind === 'hero' ? 'Hero' : 'Item'
  const peerKind = detail.kind === 'hero' ? 'heroes' : 'items'
  const backHref = patternsHash(detail.kind)
  const [openBar, setOpenBar] = useState<OpenBar | null>(null)
  const closePanel = useCallback(() => setOpenBar(null), [])

  const selected = openBar
    ? detail.series.find((point) => point.patchId === openBar.patchId)
    : undefined
  const listed = selected ? eventsForBar(selected.events, openBar!.side) : []
  const percentileLabel = selected
    ? formatPercentileLabel(
        chartMode === 'extent' ? selected.extentPercentile : selected.countsPercentile,
        selected.peerN,
        chartMode,
      )
    : ''

  return (
    <section className="pattern-detail" aria-label={`${detail.name} pattern`}>
      <p className="pattern-back">
        <a href={backHref}>← {detail.kind === 'hero' ? 'Heroes' : 'Items'} heatmap</a>
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
        <div className="chips" role="radiogroup" aria-label="Chart Y scale">
          <button
            type="button"
            className="chip"
            role="radio"
            aria-checked={chartMode === 'counts'}
            aria-pressed={chartMode === 'counts'}
            onClick={() => onChartMode('counts')}
          >
            Counts
          </button>
          <button
            type="button"
            className="chip"
            role="radio"
            aria-checked={chartMode === 'extent'}
            aria-pressed={chartMode === 'extent'}
            onClick={() => onChartMode('extent')}
          >
            Extent
          </button>
        </div>
        <button
          type="button"
          className="chip"
          aria-pressed={showCumulative}
          onClick={() => onToggleCumulative(!showCumulative)}
        >
          Cumulative net
        </button>
      </div>
      {chartMode === 'extent' ? (
        <p className="pattern-extent-callout" role="note">
          {EXTENT_CALLOUT}
        </p>
      ) : null}
      <p className="pattern-chart-note">{COUNTS_NOTE}</p>
      <p className="pattern-chart-peer-legend">
        Peer set = other {peerKind} with ≥1 buff/nerf that same patch. Percentile
        matches the {chartMode === 'extent' ? 'Extent' : 'Counts'} toggle.
        n≤3 → no percentile.
      </p>
      <BuffNerfChart
        series={detail.series}
        mode={chartMode}
        showCumulative={showCumulative}
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
        mode={chartMode}
        percentileLabel={percentileLabel}
        events={listed}
        onClose={closePanel}
      />
    </section>
  )
}

function BuffNerfChart({
  series,
  mode,
  showCumulative,
  openBar,
  onOpenBar,
}: {
  series: PatternSeriesPoint[]
  mode: PatternChartMode
  showCumulative: boolean
  openBar: OpenBar | null
  onOpenBar: (next: OpenBar | null) => void
}) {
  const clipId = useId().replace(/:/g, '')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const values = series.map((point) =>
    mode === 'counts'
      ? { up: point.counts.buff, down: point.counts.nerf }
      : { up: point.extent.buff, down: point.extent.nerf },
  )
  const peerMax = series.reduce((max, point) => {
    const band = mode === 'counts' ? point.peerCounts : point.peerExtent
    if (!band) return max
    return Math.max(max, band.p90Buff, band.p90Nerf, band.medianBuff, band.medianNerf)
  }, 0)
  const maxAbs = Math.max(
    1,
    Math.ceil(
      Math.max(
        peerMax,
        ...values.map((value) => Math.max(value.up, value.down)),
      ),
    ),
  )
  const cumulatives = series.map((point) => point.cumulativeNet)
  const maxAbsCum = Math.max(1, ...cumulatives.map((value) => Math.abs(value)))
  const groupW = 42
  const pad = { top: 28, right: showCumulative ? 48 : 14, bottom: 36, left: 46 }
  const plotH = 220
  const width = pad.left + pad.right + series.length * groupW
  const height = pad.top + pad.bottom + plotH
  const zeroY = pad.top + plotH / 2
  const barW = 10
  const halfH = plotH / 2

  const valueY = (value: number) => zeroY - (value / maxAbs) * halfH
  const cumY = (value: number) => zeroY - (value / maxAbsCum) * halfH

  const line = series
    .map((point, index) => {
      const x = pad.left + index * groupW + groupW / 2
      const y = cumY(point.cumulativeNet)
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`
    })
    .join(' ')

  const ticks = [1, 0.5, 0, -0.5, -1]
  const ariaLabel =
    mode === 'counts'
      ? 'Per-patch buff and nerf event counts, buffs above zero, nerfs below. Click a bar for the lines in it.'
      : 'Per-patch estimated buff and nerf relative-percent extent, buffs above zero, nerfs below. Click a bar for the lines in it.'

  const toggle = (patchId: string, side: BarSide) => {
    onOpenBar(
      openBar && openBar.patchId === patchId && openBar.side === side
        ? null
        : { patchId, side },
    )
  }

  const hovered = hoverId
    ? series.find((point) => point.patchId === hoverId)
    : openBar
      ? series.find((point) => point.patchId === openBar.patchId)
      : undefined

  return (
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
                {formatAxisValue(value, mode)}
              </text>
            </g>
          )
        })}
        {series.map((point, index) => {
          const band = mode === 'counts' ? point.peerCounts : point.peerExtent
          if (!band) return null
          return (
            <PeerReferenceMarks
              key={`peer-${point.patchId}`}
              x0={pad.left + index * groupW}
              groupW={groupW}
              zeroY={zeroY}
              halfH={halfH}
              maxAbs={maxAbs}
              band={band}
            />
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
          const percentile =
            mode === 'extent' ? point.extentPercentile : point.countsPercentile
          const onGroupKey = (event: KeyboardEvent<SVGGElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle(point.patchId, 'all')
            }
          }
          return (
            <g
              key={point.patchId}
              className={`pattern-bar-group${selected ? ' is-open' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`${point.date}: ${pointTooltip(point, mode)}. ${formatPercentileLabel(percentile, point.peerN, mode)}. Open line details.`}
              onFocus={() => setHoverId(point.patchId)}
              onBlur={() => setHoverId((id) => (id === point.patchId ? null : id))}
              onMouseEnter={() => setHoverId(point.patchId)}
              onMouseLeave={() => setHoverId((id) => (id === point.patchId ? null : id))}
              onKeyDown={onGroupKey}
            >
              <title>
                {pointTooltip(point, mode)}. {formatPercentileLabel(percentile, point.peerN, mode)}
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
                className={`pattern-bar-buff${point.extent.estimated && mode === 'extent' ? ' is-approx' : ''}`}
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
                className={`pattern-bar-nerf${point.extent.estimated && mode === 'extent' ? ' is-approx' : ''}`}
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
                cy={cumY(point.cumulativeNet)}
                r={2.4}
              />
            ))}
          </g>
        ) : null}
        {showCumulative ? (
          <>
            <text
              className="pattern-chart-axis pattern-chart-axis-gold"
              x={width - 6}
              y={cumY(maxAbsCum) + 3}
              textAnchor="end"
            >
              +{maxAbsCum}
            </text>
            <text
              className="pattern-chart-axis pattern-chart-axis-gold"
              x={width - 6}
              y={cumY(-maxAbsCum) + 3}
              textAnchor="end"
            >
              −{maxAbsCum}
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
            {hoverPercentileText(hovered, mode)}
          </text>
        ) : null}
      </svg>
    </div>
  )
}

function PeerReferenceMarks({
  x0,
  groupW,
  zeroY,
  halfH,
  maxAbs,
  band,
}: {
  x0: number
  groupW: number
  zeroY: number
  halfH: number
  maxAbs: number
  band: PeerBand
}) {
  const x = x0 + 3
  const w = groupW - 6
  const yUp = (value: number) => zeroY - (value / maxAbs) * halfH
  const yDown = (value: number) => zeroY + (value / maxAbs) * halfH
  const buffBandH = Math.max(0, yUp(band.medianBuff) - yUp(band.p90Buff))
  const nerfBandH = Math.max(0, yDown(band.p90Nerf) - yDown(band.medianNerf))
  return (
    <g className="pattern-peer-marks" aria-hidden="true">
      {buffBandH > 0.5 ? (
        <rect
          className="pattern-peer-band-buff"
          x={x}
          y={yUp(band.p90Buff)}
          width={w}
          height={buffBandH}
        />
      ) : null}
      {nerfBandH > 0.5 ? (
        <rect
          className="pattern-peer-band-nerf"
          x={x}
          y={yDown(band.medianNerf)}
          width={w}
          height={nerfBandH}
        />
      ) : null}
      {band.medianBuff > 0 ? (
        <line
          className="pattern-peer-tick-median"
          x1={x}
          x2={x + w}
          y1={yUp(band.medianBuff)}
          y2={yUp(band.medianBuff)}
        />
      ) : null}
      {band.p90Buff > 0 ? (
        <line
          className="pattern-peer-tick-p90"
          x1={x}
          x2={x + w}
          y1={yUp(band.p90Buff)}
          y2={yUp(band.p90Buff)}
        />
      ) : null}
      {band.medianNerf > 0 ? (
        <line
          className="pattern-peer-tick-median"
          x1={x}
          x2={x + w}
          y1={yDown(band.medianNerf)}
          y2={yDown(band.medianNerf)}
        />
      ) : null}
      {band.p90Nerf > 0 ? (
        <line
          className="pattern-peer-tick-p90"
          x1={x}
          x2={x + w}
          y1={yDown(band.p90Nerf)}
          y2={yDown(band.p90Nerf)}
        />
      ) : null}
    </g>
  )
}

function hoverPercentileText(
  point: PatternSeriesPoint,
  mode: PatternChartMode,
): string {
  if (point.peerN < MIN_PEER_SAMPLE) return 'n too small'
  const percentile = mode === 'extent' ? point.extentPercentile : point.countsPercentile
  if (percentile === null) return 'no rank'
  return `P${percentile} ${mode}`
}

function formatAxisValue(value: number, mode: PatternChartMode): string {
  const rounded = Math.round(Math.abs(value))
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${rounded}${mode === 'extent' ? '%' : ''}`
}

function formatExtent(value: number): string {
  if (value === 0) return '0%'
  const body = value >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${body.replace(/\.0$/, '')}%`
}

function pointTooltip(point: PatternSeriesPoint, mode: PatternChartMode): string {
  if (mode === 'counts') {
    return [
      `${point.date}: ${point.counts.buff} buff, ${point.counts.nerf} nerf`,
      point.counts.fix ? `${point.counts.fix} fix` : '',
      point.counts.neutral ? `${point.counts.neutral} other` : '',
    ]
      .filter(Boolean)
      .join(', ')
  }
  const est = point.extent.estimated ? ' (approximate)' : ''
  return `${point.date}: +${formatExtent(point.extent.buff)} buff extent, −${formatExtent(point.extent.nerf)} nerf extent${est}`
}
