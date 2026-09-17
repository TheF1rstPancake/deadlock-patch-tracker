import {
  cellSummary,
  cellTone,
  compactPatchLabel,
  volumeOpacity,
  type PatternEntity,
  type PatternMatrix,
} from '../lib/patterns.ts'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'

interface PatternHeatmapProps {
  matrix: PatternMatrix
  query: string
  onSelect: (entity: PatternEntity) => void
}

export function PatternHeatmap({ matrix, query, onSelect }: PatternHeatmapProps) {
  const needle = query.trim().toLowerCase()
  const rows = needle
    ? matrix.entities.filter((entity) =>
        entity.name.toLowerCase().includes(needle),
      )
    : matrix.entities
  const kindLabel = matrix.kind === 'hero' ? 'Heroes' : 'Items'

  if (rows.length === 0) {
    return <p className="empty">No {kindLabel.toLowerCase()} match that search.</p>
  }

  return (
    <div className="pattern-heatmap" tabIndex={0}>
      <table className="pattern-table">
        <caption className="sr-only">
          {kindLabel} by patch. Color is signed net (buffs minus nerfs). Number
          is buff+nerf volume. Empty cells were not touched that patch.
        </caption>
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
  onSelect: (entity: PatternEntity) => void
}

function HeatmapRow({
  entity,
  patches,
  maxTouchVolume,
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
          {entity.totalTouches} touch
          {entity.totalTouches === 1 ? '' : 'es'}
        </span>
      </th>
      {entity.cells.map((cell, index) => {
        const tone = cellTone(cell)
        const date = patches[index]?.date ?? cell.patchId
        const showCount = cell.touched && cell.touchVolume > 0
        const style: CSSProperties | undefined =
          tone === 'buff' || tone === 'nerf' || tone === 'churn'
            ? {
                ['--cell-alpha' as string]: String(
                  volumeOpacity(cell.touchVolume, maxTouchVolume),
                ),
              }
            : undefined
        return (
          <td
            key={cell.patchId}
            className={`pattern-cell tone-${tone}${cell.counts.fix > 0 ? ' has-fix' : ''}`}
            style={style}
            title={cellSummary(cell, date)}
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
