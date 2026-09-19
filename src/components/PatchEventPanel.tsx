import {
  formatAspectPeerHeadline,
  formatRelativeChange,
  rankEventMetrics,
  type AspectPeerIndex,
} from '../lib/aspectPeers.ts'
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
  const ranks = patchId ? rankEventMetrics(peers, event, patchId) : []
  const extent = eventExtent(event)
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
        {event.metrics && event.metrics.length > 0 ? (
          <ul className="pattern-event-metrics">
            {event.metrics.map((metric, index) => (
              <li key={`${event.id}-m-${index}`}>{formatMetric(metric)}</li>
            ))}
          </ul>
        ) : null}
        {ranks.length > 0
          ? ranks.map((rank, index) => (
              <p key={`${event.id}-peer-${index}`} className="pattern-event-extent">
                {formatAspectPeerHeadline(rank, lens)}
                <span className="pattern-event-extent-rel">
                  {formatRelativeChange(rank.relativePct)}
                </span>
              </p>
            ))
          : event.tag === 'buff' || event.tag === 'nerf'
            ? (
                <p className="pattern-event-extent">
                  approx. {formatWeight(extent.weight)} extent
                </p>
              )
            : null}
      </div>
    </li>
  )
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
