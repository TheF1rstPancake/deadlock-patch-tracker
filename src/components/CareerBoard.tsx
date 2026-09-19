import {
  careerNet,
  formatSignedValue,
  formatTotalsLine,
  type CareerRow,
  type NetBasis,
} from '../lib/patterns.ts'
import { patternsHash } from '../lib/route.ts'

interface CareerBoardProps {
  rows: CareerRow[]
  basis: NetBasis
  kind: 'hero' | 'item'
}

export function CareerBoard({ rows, basis, kind }: CareerBoardProps) {
  const kindLabel = kind === 'hero' ? 'Heroes' : 'Items'
  if (rows.length === 0) {
    return <p className="empty">No {kindLabel.toLowerCase()} match that search.</p>
  }

  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(careerNet(row, basis))))
  const caption =
    basis === 'extent'
      ? `${kindLabel} ranked by lifetime signed approximate extent (buff minus nerf). Click a row for the entity chart.`
      : `${kindLabel} ranked by lifetime signed net (buff lines minus nerf lines). Click a row for the entity chart.`

  return (
    <div className="career-board">
      <p className="sr-only">{caption}</p>
      <ol className="career-list">
        {rows.map((row) => {
          const net = careerNet(row, basis)
          const frac = Math.min(1, Math.abs(net) / maxAbs)
          const side = net > 0 ? 'buff' : net < 0 ? 'nerf' : 'zero'
          const widthPct = `${(frac * 50).toFixed(2)}%`
          return (
            <li key={row.slug}>
              <a
                className={`career-row is-${side}`}
                href={patternsHash(row.kind, row.slug)}
                aria-label={`${row.name}, lifetime net ${formatSignedValue(net, basis)}. ${formatTotalsLine(row.totals)}. Open detail.`}
              >
                <span className="career-name">{row.name}</span>
                <span className="career-track" aria-hidden="true">
                  <span className="career-zero" />
                  {net !== 0 ? (
                    <span
                      className={`career-bar is-${side}`}
                      style={
                        side === 'buff'
                          ? { left: '50%', width: widthPct }
                          : { right: '50%', width: widthPct }
                      }
                    />
                  ) : (
                    <span className="career-bar is-zero" />
                  )}
                </span>
                <span className="career-net">{formatSignedValue(net, basis)}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
