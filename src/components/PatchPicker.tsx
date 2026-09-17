import type { HistoryPatchSummary } from '../types.ts'

interface PatchPickerProps {
  patches: HistoryPatchSummary[]
  selectedId: string
  onSelect: (id: string) => void
}

export function PatchPicker({
  patches,
  selectedId,
  onSelect,
}: PatchPickerProps) {
  return (
    <label className="patch-picker">
      <span className="sr-only">Choose a patch</span>
      <select
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {patches.map((patch) => (
          <option key={patch.id} value={patch.id}>
            {patch.date} · {patch.title}
          </option>
        ))}
      </select>
    </label>
  )
}
