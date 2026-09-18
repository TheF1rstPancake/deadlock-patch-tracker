import { HeroPortrait } from './HeroPortrait.tsx'
import { PatchEventPanel } from './PatchEventPanel.tsx'
import {
  COUNTS_CHART_LEGEND,
  COUNTS_CHART_SUBTITLE,
  EXTENT_CALLOUT,
  EXTENT_CHART_LEGEND,
  EXTENT_CHART_SUBTITLE,
  PEERS_CHART_LEGEND,
  PEERS_CHART_SUBTITLE,
  chartBarValues,
  clippedDisplayMax,
  compactPatchLabel,
  eventsForBar,
  formatHistoryPercentileLabel,
  formatPercentileLabel,
  formatTotalsLine,
  historySampleN,
  MIN_PEER_SAMPLE,
  percentileForBar,
  type BarSide,
  type PatternChartMode,
  type PatternEntityDetail,
  type PatternSeriesPoint,
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

interface OpenBar {
  patchId: string
  side: BarSide
}

const MODES: Array<{ id: PatternChartMode; label: string; title: string }> = [
  {
    id: 'extent',
    label: 'Across patches',
    title: 'Absolute extent — how hard was this change, period',
  },
  {
    id: 'peers',
    label: 'That day',
    title: 'Among heroes or items touched this patch only',
  },
  { id: 'counts', label: 'Counts', title: 'Event line volume that patch' },
]

export function PatternDetail({
  detail,
  chartMode,
  onChartMode,
  showCumulative,
  onToggleCumulative,
}: PatternDetailProps) {
  const kindLabel = detail.kind === 'hero' ? 'Hero' : 'Item'
  const backHref = patternsHash(detail.kind)
  const [openBar, setOpenBar] = useState<OpenBar | null>(null)
  const closePanel = useCallback(() => setOpenBar(null), [])

  const selected = openBar
    ? detail.series.find((point) => point.patchId === openBar.patchId)
    : undefined
  const listed = selected ? eventsForBar(selected.events, openBar!.side) : []
  const percentileLabel = selected
    ? chartMode === 'extent'
      ? formatHistoryPercentileLabel(
          percentileForBar(selected, chartMode, openBar!.side),
          historySampleN(selected, openBar!.side),
          openBar!.side,
        )
      : formatPercentileLabel(
          percentileForBar(selected, chartMode, openBar!.side),
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
        <div className="chips" role="radiogroup" aria-label="Chart lens">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className="chip"
              role="radio"
              title={mode.title}
              aria-checked={chartMode === mode.id}
              aria-pressed={chartMode === mode.id}
              onClick={() => onChartMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
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
      {chartMode === 'extent' || chartMode === 'peers' ? (
        <p className="pattern-extent-callout" role="note">
          {EXTENT_CALLOUT}
        </p>
      ) : null}
      <p className="pattern-chart-kicker">{subtitleFor(chartMode)}</p>
      <p className="pattern-chart-note">{legendFor(chartMode)}</p>
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

function subtitleFor(mode: PatternChartMode): string {
  if (mode === 'counts') return COUNTS_CHART_SUBTITLE
  if (mode === 'extent') return EXTENT_CHART_SUBTITLE
  return PEERS_CHART_SUBTITLE
}

function legendFor(mode: PatternChartMode): string {
  if (mode === 'counts') return COUNTS_CHART_LEGEND
  if (mode === 'extent') return EXTENT_CHART_LEGEND
  return PEERS_CHART_LEGEND
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
  const values = series.map((point) => chartBarValues(point, mode))
  const extentScale =
    mode === 'extent'
      ? clippedDisplayMax(values.flatMap((value) => [value.up, value.down]))
      : { max: 1, clipped: false }
  const maxAbs =
    mode === 'peers'
      ? 100
      : mode === 'extent'
        ? extentScale.max
        : Math.max(
            1,
            Math.ceil(Math.max(0, ...values.map((value) => Math.max(value.up, value.down)))),
          )
  const axisClipped = mode === 'extent' && extentScale.clipped
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
  const ariaLabel = ariaFor(mode)

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
      {axisClipped ? (
        <p className="pattern-axis-clipped" role="status">
          Axis clipped — one patch’s stacked % would flatten the rest. Bars at the
          cap are truncated; tooltips still show the true approximate %.
        </p>
      ) : null}
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
          const x0 = pad.left + index * groupW
          const pair = values[index]!
          const drawnUp = Math.min(pair.up, maxAbs)
          const drawnDown = Math.min(pair.down, maxAbs)
          const buffH = (drawnUp / maxAbs) * halfH
          const nerfH = (drawnDown / maxAbs) * halfH
          const label = compactPatchLabel(point.date)
          const fixDots = Math.min(point.counts.fix, 3)
          const selected = openBar?.patchId === point.patchId
          const unrankedBuff = mode === 'peers' && pair.up === 0 && point.extent.buff > 0
          const unrankedNerf = mode === 'peers' && pair.down === 0 && point.extent.nerf > 0
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
              aria-label={`${point.date}: ${pointTooltip(point, mode)}. ${rankLabel(point, mode)}. Open line details.`}
              onFocus={() => setHoverId(point.patchId)}
              onBlur={() => setHoverId((id) => (id === point.patchId ? null : id))}
              onMouseEnter={() => setHoverId(point.patchId)}
              onMouseLeave={() => setHoverId((id) => (id === point.patchId ? null : id))}
              onKeyDown={onGroupKey}
            >
              <title>
                {pointTooltip(point, mode)}. {rankLabel(point, mode)}
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
                className={`pattern-bar-buff${point.extent.estimated && mode !== 'counts' ? ' is-approx' : ''}${pair.up > maxAbs ? ' is-clipped' : ''}${unrankedBuff ? ' is-unranked' : ''}`}
                x={x0 + 8}
                y={unrankedBuff ? zeroY - 6 : valueY(drawnUp)}
                width={barW}
                height={unrankedBuff ? 6 : Math.max(buffH, pair.up > 0 ? 2 : 0)}
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(point.patchId, 'buff')
                }}
              />
              <rect
                className={`pattern-bar-nerf${point.extent.estimated && mode !== 'counts' ? ' is-approx' : ''}${pair.down > maxAbs ? ' is-clipped' : ''}${unrankedNerf ? ' is-unranked' : ''}`}
                x={x0 + 20}
                y={zeroY}
                width={barW}
                height={unrankedNerf ? 6 : Math.max(nerfH, pair.down > 0 ? 2 : 0)}
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(point.patchId, 'nerf')
                }}
              />
              {pair.up > maxAbs ? (
                <polygon
                  className="pattern-bar-clip-cap pattern-bar-clip-cap-buff"
                  points={clipCapPoints(x0 + 8, pad.top, barW, 'up')}
                />
              ) : null}
              {pair.down > maxAbs ? (
                <polygon
                  className="pattern-bar-clip-cap pattern-bar-clip-cap-nerf"
                  points={clipCapPoints(x0 + 20, pad.top + plotH, barW, 'down')}
                />
              ) : null}
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

function clipCapPoints(x: number, edgeY: number, w: number, side: 'up' | 'down'): string {
  const mid = x + w / 2
  if (side === 'up') {
    return `${x},${edgeY + 7} ${x + w},${edgeY + 7} ${mid},${edgeY}`
  }
  return `${x},${edgeY - 7} ${x + w},${edgeY - 7} ${mid},${edgeY}`
}

function ariaFor(mode: PatternChartMode): string {
  if (mode === 'counts') {
    return 'Per-patch buff and nerf event counts, buffs above zero, nerfs below. Click a bar for the lines in it.'
  }
  if (mode === 'extent') {
    return 'Across patches: per-patch estimated relative-percent extent, buffs above zero, nerfs below. Same percent math over time. Axis may be clipped. Click a bar for the lines in it.'
  }
  return 'That day: per-patch peer percentile of buff and nerf extent among heroes or items touched this patch only. Quiet patches and bloodbaths are not the same. Click a bar for the lines in it.'
}

function rankLabel(point: PatternSeriesPoint, mode: PatternChartMode): string {
  if (mode === 'extent') {
    const side = louderHistorySide(point)
    return formatHistoryPercentileLabel(
      percentileForBar(point, mode, side),
      historySampleN(point, side),
      side,
    )
  }
  return formatPercentileLabel(
    percentileForBar(point, mode),
    point.peerN,
    mode,
  )
}

function louderHistorySide(point: PatternSeriesPoint): BarSide {
  const buff = point.historyBuffPercentile
  const nerf = point.historyNerfPercentile
  if (buff === null) return 'nerf'
  if (nerf === null) return 'buff'
  return nerf >= buff ? 'nerf' : 'buff'
}

function hoverPercentileText(
  point: PatternSeriesPoint,
  mode: PatternChartMode,
): string {
  if (mode === 'peers') {
    if (point.peerN < MIN_PEER_SAMPLE) return 'n too small that day'
    const buff = point.extentBuffPercentile
    const nerf = point.extentNerfPercentile
    if (buff === null && nerf === null) return 'no rank'
    if (buff !== null && nerf !== null) return `P${buff} buff · P${nerf} nerf that day`
    if (buff !== null) return `P${buff} buff that day`
    return `P${nerf} nerf that day`
  }
  if (mode === 'extent') {
    const buff = point.historyBuffPercentile
    const nerf = point.historyNerfPercentile
    if (buff === null && nerf === null) return 'no ledger rank'
    if (buff !== null && nerf !== null) return `P${buff} ledger buff · P${nerf} ledger nerf`
    if (buff !== null) return `P${buff} ledger buff`
    return `P${nerf} ledger nerf`
  }
  const percentile = percentileForBar(point, mode)
  if (percentile === null) return 'no rank'
  return `P${percentile} counts`
}

function formatAxisValue(value: number, mode: PatternChartMode): string {
  const rounded = Math.round(Math.abs(value))
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  if (mode === 'peers') {
    if (value === 0) return '0'
    return `${sign}P${rounded}`
  }
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
  if (mode === 'peers') {
    const buff =
      point.extentBuffPercentile === null
        ? point.extent.buff > 0
          ? 'n too small'
          : '—'
        : `P${point.extentBuffPercentile}`
    const nerf =
      point.extentNerfPercentile === null
        ? point.extent.nerf > 0
          ? 'n too small'
          : '—'
        : `P${point.extentNerfPercentile}`
    return `${point.date}: ${buff} buff rank, ${nerf} nerf rank (not raw %)`
  }
  const est = point.extent.estimated ? ' (approximate)' : ''
  const history = formatHistoryPercentileLabel(
    percentileForBar(point, 'extent', louderHistorySide(point)),
    historySampleN(point, louderHistorySide(point)),
    louderHistorySide(point),
  )
  return `${point.date}: +${formatExtent(point.extent.buff)} buff extent, −${formatExtent(point.extent.nerf)} nerf extent${est}. ${history}`
}
