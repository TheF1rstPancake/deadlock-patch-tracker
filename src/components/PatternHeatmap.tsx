import {
  cellSummary,
  cellTone,
  compactPatchLabel,
  percentileOpacity,
  volumeOpacity,
  type HeatmapColorMode,
  type PatternEntity,
  type PatternMatrix,
} from '../lib/patterns.ts'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'

interface PatternHeatmapProps {
  matrix: PatternMatrix
  colorMode?: HeatmapColorMode
  rowMeta?: 'recent' | 'total'
  onSelect: (entity: PatternEntity) => void
}

export function PatternHeatmap({
  matrix,
  colorMode = 'absolute',
  rowMeta = 'total',
  onSelect,
}: PatternHeatmapProps) {
  const rows = matrix.entities
  const kindLabel = matrix.kind === 'hero' ? 'Heroes' : 'Items'
  const peerKind = matrix.kind === 'hero' ? 'heroes' : 'items'

  if (rows.length === 0) {
    return <p className="empty">No {kindLabel.toLowerCase()} match that search.</p>
  }

  const caption =
    colorMode === 'relative'
      ? `${kindLabel} by patch. Color intensity is this row’s estimated-extent percentile versus other ${peerKind} with a buff or nerf that same patch (max of buff/nerf extent). Hue is buff vs nerf. Empty cells were not touched. n≤3 that patch has no percentile.`
      : `${kindLabel} by patch. Color is signed net (buffs minus nerfs). Number is buff+nerf volume. Empty cells were not touched that patch.`

  return (
    <div className="pattern-heatmap" tabIndex={0}>
      <table className="pattern-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="pattern-corner">
              {kindLabel}
            </th>
            {matrix.patches.map((column) => (
              <th
                key={column.id}
                scope="col"
                title={`${column.date} · ${column.title}`}
              >
                <span className="pattern-col-label">
                  {compactPatchLabel(column.date)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((entity) => (
            <HeatmapRow
              key={entity.slug}
              entity={entity}
              patches={matrix.patches}
              maxTouchVolume={matrix.maxTouchVolume}
              colorMode={colorMode}
              rowMeta={rowMeta}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface HeatmapRowProps {
  entity: PatternEntity
  patches: PatternMatrix['patches']
  maxTouchVolume: number
  colorMode: HeatmapColorMode
  rowMeta: 'recent' | 'total'
  onSelect: (entity: PatternEntity) => void
}

function HeatmapRow({
  entity,
  patches,
  maxTouchVolume,
  colorMode,
  rowMeta,
  onSelect,
}: HeatmapRowProps) {
  const activate = () => onSelect(entity)
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  }

  return (
    <tr
      className="pattern-row"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKey}
      aria-label={`${entity.name}, ${entity.totalTouches} buff and nerf events. Open detail.`}
    >
      <th scope="row" className="pattern-entity">
        <span className="pattern-entity-name">{entity.name}</span>
        <span className="pattern-entity-meta">
          {rowMeta === 'recent'
            ? `${entity.recentTouches} recent`
            : `${entity.totalTouches} touch${entity.totalTouches === 1 ? '' : 'es'}`}
        </span>
      </th>
      {entity.cells.map((cell, index) => {
        const tone = cellTone(cell)
        const column = patches[index]
        const date = column?.date ?? cell.patchId
        const peerN = column?.peerN ?? 0
        const showCount = cell.touched && cell.touchVolume > 0
        const tooSmall =
          colorMode === 'relative' && showCount && cell.extentPercentile === null
        const style: CSSProperties | undefined =
          tone === 'buff' || tone === 'nerf' || tone === 'churn'
            ? {
                ['--cell-alpha' as string]: String(
                  colorMode === 'relative'
                    ? percentileOpacity(cell.extentPercentile)
                    : volumeOpacity(cell.touchVolume, maxTouchVolume),
                ),
              }
            : undefined
        return (
          <td
            key={cell.patchId}
            className={`pattern-cell tone-${tone}${cell.counts.fix > 0 ? ' has-fix' : ''}${tooSmall ? ' peer-small' : ''}`}
            style={style}
            title={cellSummary(cell, date, peerN, colorMode)}
          >
            {showCount ? (
              <span className="pattern-cell-count">{cell.touchVolume}</span>
            ) : tone === 'fix' ? (
              <span className="pattern-cell-fix" aria-hidden="true">
                ·
              </span>
            ) : tone === 'neutral' ? (
              <span className="pattern-cell-neutral" aria-hidden="true">
                ~
              </span>
            ) : null}
          </td>
        )
      })}
    </tr>
  )
}

export function PatternSearchForm({
  query,
  onQuery,
  onSubmitMatch,
  kind,
}: {
  query: string
  onQuery: (next: string) => void
  onSubmitMatch: () => void
  kind: 'hero' | 'item'
}) {
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmitMatch()
  }
  return (
    <form className="search pattern-search" onSubmit={onSubmit}>
      <label>
        <span className="sr-only">
          Search {kind === 'hero' ? 'heroes' : 'items'}
        </span>
        <input
          type="search"
          value={query}
          placeholder={kind === 'hero' ? 'Find a hero' : 'Find an item'}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
    </form>
  )
}
