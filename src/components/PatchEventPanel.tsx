import {
  formatAspectPeerHeadline,
  formatRelativeChange,
  rankMetricLine,
  eventAspectText,
  type AspectPeerIndex,
  type AspectPeerRank,
} from '../lib/aspectPeers.ts'
import {
  NO_ROSTER_BASELINE_CHIP,
  ROSTER_HINT,
  formatRosterHeadline,
  scoreMetricAbsolute,
  type AbsoluteNormScore,
} from '../lib/rosterBaselines.ts'
import { metricRelativePercent } from '../lib/metrics.ts'
import { eventExtent, type BarSide, type PatternLens } from '../lib/patterns.ts'
import { LINE_GLYPH, LINE_LABEL } from '../lib/labels.ts'
import type { ChangeEvent, MetricDelta } from '../types.ts'
import { useEffect, useId, useRef } from 'react'

interface PatchEventPanelProps {
  open: boolean
  title: string
  side: BarSide
  percentileLabel: string
  events: ChangeEvent[]
  patchId?: string
  lens: PatternLens
  peers: AspectPeerIndex
  onClose: () => void
}

export function PatchEventPanel({
  open,
  title,
  side,
  percentileLabel,
  events,
  patchId,
  lens,
  peers,
  onClose,
}: PatchEventPanelProps) {
  const headingId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const sideLabel =
    side === 'all' ? 'all lines that patch' : `${side} lines in this bar`

  return (
    <div className="pattern-drawer-root">
      <button
        type="button"
        className="pattern-drawer-scrim"
        aria-label="Close line details"
        onClick={onClose}
      />
      <aside
        className="pattern-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="pattern-drawer-head">
          <div>
            <p className="kicker">{sideLabel}</p>
            <h3 id={headingId}>{title}</h3>
            {percentileLabel ? (
              <p className="pattern-drawer-peer">{percentileLabel}</p>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="chip"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        {events.length === 0 ? (
          <p className="empty">No lines in this bar.</p>
        ) : (
          <ul className="pattern-event-list">
            {events.map((event) => (
              <EventLine
                key={event.id}
                event={event}
                patchId={patchId}
                lens={lens}
                peers={peers}
              />
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}

function EventLine({
  event,
  patchId,
  lens,
  peers,
}: {
  event: ChangeEvent
  patchId?: string
  lens: PatternLens
  peers: AspectPeerIndex
}) {
  const text = event.display ?? event.raw
  const aspectText = eventAspectText(event)
  const extent = eventExtent(event)
  const signed = event.tag === 'buff' || event.tag === 'nerf'
  const metrics = event.metrics ?? []
  const blocks = signed
    ? metrics.map((metric, index) => {
        const rank = patchId
          ? rankMetricLine(peers, event, metric, patchId)
          : undefined
        return {
          key: `${event.id}-extent-${index}`,
          abs: scoreMetricAbsolute(metric, aspectText),
          rank,
          relativePct: rank?.relativePct ?? metricRelativePercent(metric),
        }
      })
    : []
  const hasExtent = blocks.some(
    (block) => block.abs.status === 'ok' || block.rank,
  )

  return (
    <li className={`pattern-event change-${event.tag}`}>
      <span className="glyph" aria-hidden="true">
        {LINE_GLYPH[event.tag]}
      </span>
      <div className="change-text">
        <span className="sr-only">{LINE_LABEL[event.tag]}: </span>
        {text}
        {event.clarified ? (
          <details className="clarified">
            <summary>
              Clarified
              <span className="sr-only">. Show original Steam wording.</span>
            </summary>
            <p className="steam-raw">
              <span className="steam-raw-kicker">Steam:</span> {event.raw}
            </p>
          </details>
        ) : null}
        {metrics.length > 0 ? (
          <ul className="pattern-event-metrics">
            {metrics.map((metric, index) => (
              <li key={`${event.id}-m-${index}`}>{formatMetric(metric)}</li>
            ))}
          </ul>
        ) : null}
        {blocks.map((block) => (
          <ExtentCard
            key={block.key}
            abs={block.abs}
            rank={block.rank}
            relativePct={block.relativePct}
            lens={lens}
          />
        ))}
        {signed && !hasExtent ? (
          <p className="pattern-event-extent">
            approx. {formatWeight(extent.weight)} extent
            <span className="pattern-event-extent-chip">
              {NO_ROSTER_BASELINE_CHIP}
            </span>
          </p>
        ) : null}
      </div>
    </li>
  )
}

function ExtentCard({
  abs,
  rank,
  relativePct,
  lens,
}: {
  abs: AbsoluteNormScore
  rank: AspectPeerRank | undefined
  relativePct: number | undefined
  lens: PatternLens
}) {
  if (abs.status === 'ok') {
    return (
      <p className="pattern-event-extent">
        {formatRosterHeadline(abs)}
        <span className="pattern-event-extent-hint">{ROSTER_HINT}</span>
        {relativePct !== undefined ? (
          <span className="pattern-event-extent-rel">
            {formatRelativeChange(relativePct)}
          </span>
        ) : null}
        {rank ? (
          <span className="pattern-event-extent-peer">
            {formatAspectPeerHeadline(rank, lens)}
          </span>
        ) : null}
      </p>
    )
  }
  if (rank) {
    return (
      <p className="pattern-event-extent">
        {formatAspectPeerHeadline(rank, lens)}
        <span className="pattern-event-extent-rel">
          {formatRelativeChange(rank.relativePct)}
        </span>
        <span className="pattern-event-extent-chip">
          {NO_ROSTER_BASELINE_CHIP}
        </span>
      </p>
    )
  }
  return null
}

function formatWeight(value: number): string {
  const body = value >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${body.replace(/\.0$/, '')}%`
}

function formatMetric(metric: MetricDelta): string {
  const bits = [metric.stat.replace(/_/g, ' ')]
  if (metric.from !== undefined || metric.to !== undefined) {
    bits.push(`${metric.from ?? '?'} -> ${metric.to ?? '?'}`)
  }
  if (metric.unit) bits.push(metric.unit)
  return bits.join(' ')
}
