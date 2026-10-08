'use client'

import { SelectIcon, SelectAddIcon, SelectSubtractIcon } from './icons'
import type { SelectionMode } from '@/lib/types'

const MODES: { mode: SelectionMode; label: string; title: string; Icon: typeof SelectIcon }[] = [
  { mode: 'replace', label: 'New selection', title: 'New selection', Icon: SelectIcon },
  { mode: 'add', label: 'Add to selection', title: 'Add to selection (hold Shift while dragging)', Icon: SelectAddIcon },
  { mode: 'subtract', label: 'Subtract from selection', title: 'Subtract from selection (hold Alt while dragging)', Icon: SelectSubtractIcon },
]

interface SelectionModeButtonsProps {
  mode: SelectionMode
  onModeChange: (mode: SelectionMode) => void
  // Styling of the surrounding toolbar, so the buttons match its tools.
  groupClassName: string
  buttonClassName: string
  activeClassName: string
  iconClassName: string
}

// How the next marquee combines with the selection. The chosen mode stays on
// until another is picked, so several areas can be added (or cut out) in a
// row - which is also the only way to do it on a touch screen.
export default function SelectionModeButtons({
  mode,
  onModeChange,
  groupClassName,
  buttonClassName,
  activeClassName,
  iconClassName,
}: SelectionModeButtonsProps) {
  return (
    <div className={groupClassName} role="group" aria-label="Selection mode">
      {MODES.map(({ mode: value, label, title, Icon }) => (
        <button
          key={value}
          onClick={() => onModeChange(value)}
          className={`${buttonClassName} ${mode === value ? activeClassName : ''}`}
          title={title}
          aria-label={label}
          aria-pressed={mode === value}
        >
          <Icon className={iconClassName} />
        </button>
      ))}
    </div>
  )
}
