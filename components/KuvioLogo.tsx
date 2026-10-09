import styles from './KuvioLogo.module.css'

// The Kuvio mark: a "k" drawn in cells on a 4 x 5 grid. 2 = the accent cell
// (the last bead placed). Construction: gap = cell / 8, radius = cell * 0.2.
const MARK_CELLS = [
  [1, 0, 0, 2],
  [1, 0, 1, 0],
  [1, 1, 0, 0],
  [1, 0, 1, 0],
  [1, 0, 0, 1],
]
const CELL = 8
const GAP = 1
const RADIUS = 1.6
const MARK_WIDTH = 4 * CELL + 3 * GAP
const MARK_HEIGHT = 5 * CELL + 4 * GAP

interface KuvioMarkProps {
  // Any CSS length; defaults to the surrounding font size.
  height?: number | string
  ink?: string
  accent?: string
  className?: string
}

export function KuvioMark({
  height = '1em',
  ink = 'var(--color-yo)',
  accent = 'var(--color-puolukka)',
  className,
}: KuvioMarkProps) {
  return (
    <svg
      className={className}
      style={{
        height,
        width: typeof height === 'number' ? (height * MARK_WIDTH) / MARK_HEIGHT : `calc(${height} * ${MARK_WIDTH / MARK_HEIGHT})`,
        flexShrink: 0,
      }}
      viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      {MARK_CELLS.flatMap((row, r) =>
        row.map((v, c) =>
          v === 0 ? null : (
            <rect
              key={`${r}-${c}`}
              x={c * (CELL + GAP)}
              y={r * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={RADIUS}
              fill={v === 2 ? accent : ink}
            />
          )
        )
      )}
    </svg>
  )
}

interface KuvioLogoProps {
  // Height of the mark in px; the wordmark scales with it. Omit to size the
  // lockup from the surrounding font size (the mark is 1em tall).
  size?: number
  variant?: 'default' | 'reversed'
  className?: string
}

// Primary lockup: the mark with the lowercase "kuvio" wordmark beside it.
export function KuvioLogo({ size, variant = 'default', className }: KuvioLogoProps) {
  const reversed = variant === 'reversed'
  return (
    <span
      className={`${styles.lockup} ${reversed ? styles.reversed : ''} ${className ?? ''}`}
      style={size === undefined ? undefined : { fontSize: size }}
      role="img"
      aria-label="Kuvio"
    >
      <KuvioMark
        ink={reversed ? 'var(--color-lumi)' : 'var(--color-yo)'}
        accent={reversed ? 'var(--color-lakka)' : 'var(--color-puolukka)'}
      />
      <span className={styles.wordmark} aria-hidden="true">
        kuvio
      </span>
    </span>
  )
}
