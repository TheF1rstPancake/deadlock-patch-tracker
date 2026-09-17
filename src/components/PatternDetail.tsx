import { HeroPortrait } from './HeroPortrait.tsx'
import {
  compactPatchLabel,
  formatTotalsLine,
  type PatternEntityDetail,
  type PatternSeriesPoint,
} from '../lib/patterns.ts'
import { patternsHash } from '../lib/route.ts'
import { useId } from 'react'

interface PatternDetailProps {
  detail: PatternEntityDetail
  showCumulative: boolean
  onToggleCumulative: (next: boolean) => void
}

export function PatternDetail({
  detail,
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
      <div className="toolbar">
        <p className="pattern-chart-lede">
          Bars are per-patch <span className="legend-buff">buff</span> vs{' '}
          <span className="legend-nerf">nerf</span> event counts. Fixes are dots,
          not bar height.
        </p>
        <button
          type="button"
          className="chip"
          aria-pressed={showCumulative}
          onClick={() => onToggleCumulative(!showCumulative)}
        >
          Cumulative net
        </button>
      </div>
      <BuffNerfChart series={detail.series} showCumulative={showCumulative} />
    </section>
  )
}

function BuffNerfChart({
  series,
  showCumulative,
}: {
  series: PatternSeriesPoint[]
  showCumulative: boolean
}) {
  const clipId = useId().replace(/:/g, '')
  const maxCount = Math.max(
    1,
    ...series.map((point) => Math.max(point.counts.buff, point.counts.nerf)),
  )
  const cumulatives = series.map((point) => point.cumulativeNet)
  const maxAbsCum = Math.max(1, ...cumulatives.map((value) => Math.abs(value)))
  const groupW = 42
  const pad = { top: 18, right: showCumulative ? 44 : 12, bottom: 36, left: 28 }
  const plotH = 160
  const width = pad.left + pad.right + series.length * groupW
  const height = pad.top + pad.bottom + plotH
  const zeroY = pad.top + plotH
  const barW = 10

  const countY = (count: number) => zeroY - (count / maxCount) * plotH
  const cumY = (value: number) =>
    pad.top + plotH / 2 - (value / maxAbsCum) * (plotH / 2)

  const line = series
    .map((point, index) => {
      const x = pad.left + index * groupW + groupW / 2
      const y = cumY(point.cumulativeNet)
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`
    })
    .join(' ')

  return (
    <div className="pattern-chart-scroll">
      <svg
        className="pattern-chart"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Per-patch buff and nerf event counts"
      >
        <defs>
          <clipPath id={`plot-${clipId}`}>
            <rect x={pad.left} y={pad.top} width={series.length * groupW} height={plotH} />
          </clipPath>
        </defs>
        {[0, 0.5, 1].map((tick) => {
          const value = Math.round(maxCount * (1 - tick))
          const y = pad.top + plotH * tick
          return (
            <g key={`grid-${tick}`}>
              <line
                className="pattern-chart-grid"
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
              />
              <text className="pattern-chart-axis" x={pad.left - 6} y={y + 3} textAnchor="end">
                {value}
              </text>
            </g>
          )
        })}
        {series.map((point, index) => {
          const x0 = pad.left + index * groupW
          const buffH = (point.counts.buff / maxCount) * plotH
          const nerfH = (point.counts.nerf / maxCount) * plotH
          const label = compactPatchLabel(point.date)
          const fixDots = Math.min(point.counts.fix, 3)
          return (
            <g key={point.patchId}>
              <title>
                {point.date}: {point.counts.buff} buff, {point.counts.nerf} nerf
                {point.counts.fix ? `, ${point.counts.fix} fix` : ''}
                {point.counts.neutral ? `, ${point.counts.neutral} other` : ''}
              </title>
              <rect
                className="pattern-bar-buff"
                x={x0 + 6}
                y={countY(point.counts.buff)}
                width={barW}
                height={buffH}
              />
              <rect
                className="pattern-bar-nerf"
                x={x0 + 18}
                y={countY(point.counts.nerf)}
                width={barW}
                height={nerfH}
              />
              {Array.from({ length: fixDots }, (_, dot) => (
                <circle
                  key={dot}
                  className="pattern-fix-dot"
                  cx={x0 + groupW / 2 + (dot - (fixDots - 1) / 2) * 5}
                  cy={pad.top + 6}
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
            <line
              className="pattern-chart-zero"
              x1={pad.left}
              x2={width - pad.right}
              y1={cumY(0)}
              y2={cumY(0)}
            />
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
