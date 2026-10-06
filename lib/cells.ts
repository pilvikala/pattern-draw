import { TRANSPARENT } from './types'

// A grid cell is stored as a plain string so every existing consumer (layer
// grids, clipboard, history, JSON saves) keeps working unchanged:
// - a full cell is a single color ("#rrggbb"), exactly as before half-pixels
//   existed - so every old drawing is already a valid drawing in this model;
// - a split (half-pixel) cell is four comma-separated quarter colors in
//   top,right,bottom,left order - the four triangles formed by both
//   diagonals - each either a color or TRANSPARENT (empty).
//
// Quarters rather than "a diagonal plus two halves" because each half-pixel
// shape is exactly two quarters (top-left = top + left, and so on), so
// painting one half over another, compositing layers, and mirroring all stay
// simple per-quarter operations with no shape that can't be represented.
// A hex color never contains ',', so the two forms can't be confused.

export type PixelShape = 'full' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'

// [top, right, bottom, left]
export type CellQuarters = [string, string, string, string]

const TOP = 0
const RIGHT = 1
const BOTTOM = 2
const LEFT = 3

const SHAPE_QUARTERS: Record<PixelShape, number[]> = {
  full: [TOP, RIGHT, BOTTOM, LEFT],
  topLeft: [TOP, LEFT],
  topRight: [TOP, RIGHT],
  bottomRight: [BOTTOM, RIGHT],
  bottomLeft: [BOTTOM, LEFT],
}

// Ordered as shown in the shape picker; `key` is the keyboard shortcut
// (active only while the pencil tool is selected).
export const PIXEL_SHAPES: { shape: PixelShape; key: string; label: string }[] = [
  { shape: 'full', key: '0', label: 'Full pixel' },
  { shape: 'topLeft', key: '1', label: 'Top-left half' },
  { shape: 'topRight', key: '2', label: 'Top-right half' },
  { shape: 'bottomRight', key: '3', label: 'Bottom-right half' },
  { shape: 'bottomLeft', key: '4', label: 'Bottom-left half' },
]

const SPLIT_SEPARATOR = ','

export function isSplitCell(value: string | undefined): boolean {
  return !!value && value.includes(SPLIT_SEPARATOR)
}

export function cellQuarters(value: string | undefined): CellQuarters {
  if (!value) return [TRANSPARENT, TRANSPARENT, TRANSPARENT, TRANSPARENT]
  if (!isSplitCell(value)) return [value, value, value, value]
  const parts = value.split(SPLIT_SEPARATOR, 5)
  // Malformed split values are treated as empty rather than guessed at -
  // normalizeCellValue drops them on load anyway.
  if (parts.length !== 4) return [TRANSPARENT, TRANSPARENT, TRANSPARENT, TRANSPARENT]
  return parts as CellQuarters
}

// Collapses to the simplest equivalent value: a single color when all four
// quarters match (TRANSPARENT when all are empty, meaning "remove the
// cell"), so a half-pixel painted over with its complement in the same color
// becomes an ordinary full pixel again - and fill/compare logic that matches
// cells by value keeps treating it as one.
export function cellFromQuarters(quarters: readonly string[]): string {
  const [t, r, b, l] = quarters
  if (t === r && r === b && b === l) return t
  return [t, r, b, l].join(SPLIT_SEPARATOR)
}

// Paints `color` onto the part of `existing` covered by `shape`, leaving the
// rest of the cell as it was (TRANSPARENT if the cell was empty).
export function paintCell(existing: string | undefined, color: string, shape: PixelShape): string {
  if (shape === 'full') return color
  const quarters = cellQuarters(existing)
  for (const q of SHAPE_QUARTERS[shape]) quarters[q] = color
  return cellFromQuarters(quarters)
}

// `above` covers `below` wherever `above` isn't transparent - per quarter,
// so a half-pixel on an upper layer lets the layer beneath show through its
// empty half.
export function compositeCell(below: string | undefined, above: string | undefined): string {
  if (!above) return below || TRANSPARENT
  if (!below || !isSplitCell(above)) return above
  const b = cellQuarters(below)
  const a = cellQuarters(above)
  return cellFromQuarters(a.map((color, i) => color || b[i]))
}

// Left-right reflection of the cell's own contents (e.g. a top-left half
// becomes a top-right half), used when mirroring a selection.
export function mirrorCellHorizontally(value: string): string {
  if (!isSplitCell(value)) return value
  const [t, r, b, l] = cellQuarters(value)
  return cellFromQuarters([t, l, b, r])
}

// The color visible at a point inside the cell, with (x, y) as fractions of
// the cell's size (0-1, origin at the top-left). Used by the color picker so
// clicking either half of a half-pixel picks that half's color.
export function cellColorAt(value: string | undefined, x: number, y: number): string {
  if (!isSplitCell(value)) return value || TRANSPARENT
  return cellQuarters(value)[quarterAt(x, y)]
}

// Index (into CellQuarters) of the quarter containing the point (x, y),
// given as fractions of the cell's size.
export function quarterAt(x: number, y: number): number {
  // The diagonals y = x and y = 1 - x split the cell into the four quarters.
  const belowMain = y > x
  const belowAnti = y > 1 - x
  return belowMain ? (belowAnti ? BOTTOM : LEFT) : (belowAnti ? RIGHT : TOP)
}

// CSS `background` value for rendering a cell, with `emptyColor` showing
// through any transparent part.
export function cellBackground(value: string | undefined, emptyColor: string): string {
  if (!isSplitCell(value)) return value || emptyColor
  const [t, r, b, l] = cellQuarters(value).map((c) => c || emptyColor)
  // Conic angles start at 12 o'clock and run clockwise; starting at -45deg
  // puts the first 90deg sector exactly on the top quarter.
  return `conic-gradient(from -45deg, ${t} 0deg 90deg, ${r} 90deg 180deg, ${b} 180deg 270deg, ${l} 270deg 360deg)`
}

// Paints a cell onto a 2D canvas context at (x, y) with the given size.
// Transparent parts are left untouched, so whatever was drawn beneath (e.g.
// the white "paper") shows through.
export function drawCell(ctx: CanvasRenderingContext2D, value: string | undefined, x: number, y: number, size: number): void {
  if (!value) return
  if (!isSplitCell(value)) {
    ctx.fillStyle = value
    ctx.fillRect(x, y, size, size)
    return
  }
  const quarters = cellQuarters(value)
  const cx = x + size / 2
  const cy = y + size / 2
  // Each quarter is the triangle between two adjacent corners and the
  // center, in top/right/bottom/left order.
  const corners: [number, number][] = [[x, y], [x + size, y], [x + size, y + size], [x, y + size]]
  for (let i = 0; i < 4; i++) {
    const color = quarters[i]
    if (!color) continue
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % 4]
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(cx, cy)
    ctx.closePath()
    ctx.fill()
  }
}

// Validates and canonicalizes a stored cell value (from localStorage, an API
// request, or a decoded share link). `normalizeColor` validates/canonicalizes
// a single color and returns null for anything invalid. A split cell keeps
// its valid quarters and treats invalid ones as transparent. Returns null when
// nothing valid remains, meaning the cell should be dropped.
export function normalizeCellValue(value: unknown, normalizeColor: (color: string) => string | null): string | null {
  if (typeof value !== 'string' || !value) return null
  if (!isSplitCell(value)) return normalizeColor(value)
  const parts = value.split(SPLIT_SEPARATOR, 5)
  if (parts.length !== 4) return null
  const quarters = parts.map((p) => (p ? normalizeColor(p) ?? TRANSPARENT : TRANSPARENT))
  return cellFromQuarters(quarters) || null
}
