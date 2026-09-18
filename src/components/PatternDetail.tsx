import { HeroPortrait } from './HeroPortrait.tsx'
import {
  compactPatchLabel,
  formatTotalsLine,
  type PatternChartMode,
  type PatternEntityDetail,
  type PatternSeriesPoint,
} from '../lib/patterns.ts'
import { patternsHash } from '../lib/route.ts'
import { useId } from 'react'

interface PatternDetailProps {
  detail: PatternEntityDetail
  chartMode: PatternChartMode
  onChartMode: (mode: PatternChartMode) => void
  showCumulative: boolean
  onToggleCumulative: (next: boolean) => void
}

const CHART_NOTE =
  'Counts: per-patch buff vs nerf event lines (buffs up, nerfs down). Extent (estimated): summed relative % change from each line’s parsed from→to metrics on the same diverging axis; lines with no numbers get a small stand-in weight so they still appear. Fixes stay dots. Not win-rate or external balance data.'

export function PatternDetail({
  detail,
  chartMode,
  onChartMode,
  showCumulative,
  onToggleCumulative,
}: PatternDetailProps) {
  const kindLabel = detail.kind === 'hero' ? 'Hero' : 'Item'
  const backHref = patternsHash(detail.kind)

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
      <p className="pattern-chart-note">{CHART_NOTE}</p>
      <BuffNerfChart
        series={detail.series}
        mode={chartMode}
        showCumulative={showCumulative}
      />
    </section>
  )
}

function BuffNerfChart({
  series,
  mode,
  showCumulative,
}: {
  series: PatternSeriesPoint[]
  mode: PatternChartMode
  showCumulative: boolean
}) {
  const clipId = useId().replace(/:/g, '')
  const values = series.map((point) =>
    mode === 'counts'
      ? { up: point.counts.buff, down: point.counts.nerf }
      : { up: point.extent.buff, down: point.extent.nerf },
  )
  const maxAbs = Math.max(
    1,
    Math.ceil(Math.max(...values.map((value) => Math.max(value.up, value.down)))),
  )
  const cumulatives = series.map((point) => point.cumulativeNet)
  const maxAbsCum = Math.max(1, ...cumulatives.map((value) => Math.abs(value)))
  const groupW = 42
  const pad = { top: 22, right: showCumulative ? 48 : 14, bottom: 36, left: 46 }
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
      ? 'Per-patch buff and nerf event counts, buffs above zero, nerfs below'
      : 'Per-patch estimated buff and nerf relative-percent extent, buffs above zero, nerfs below'

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
                className={`pattern-chart-axis${tick < 0 ? ' pattern-chart-axis-neg' : ''}${tick === 0 ? ' pattern-chart-axis-zero' : ''}`}
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
          const pair = values[index]
          const buffH = (pair.up / maxAbs) * halfH
          const nerfH = (pair.down / maxAbs) * halfH
          const label = compactPatchLabel(point.date)
          const fixDots = Math.min(point.counts.fix, 3)
          return (
            <g key={point.patchId}>
              <title>{pointTooltip(point, mode)}</title>
              <rect
                className="pattern-bar-buff"
                x={x0 + 8}
                y={valueY(pair.up)}
                width={barW}
                height={buffH}
              />
              <rect
                className="pattern-bar-nerf"
                x={x0 + 20}
                y={zeroY}
                width={barW}
                height={nerfH}
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
      </svg>
    </div>
  )
}

function formatAxisValue(value: number, mode: PatternChartMode): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  const body = String(Math.abs(rounded))
  return `${sign}${body}${mode === 'extent' ? '%' : ''}`
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
  const est = point.extent.estimated ? ' (estimated)' : ''
  return `${point.date}: +${formatExtent(point.extent.buff)} buff extent, −${formatExtent(point.extent.nerf)} nerf extent${est}`
}
