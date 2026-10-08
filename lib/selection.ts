import { TRANSPARENT } from './types'
import type { SelectionRect, ClipboardData, CellSelection, SelectionMode } from './types'
import { mirrorCellHorizontally } from './cells'

export function normalizeRect(rowA: number, colA: number, rowB: number, colB: number): SelectionRect {
  return {
    startRow: Math.min(rowA, rowB),
    startCol: Math.min(colA, colB),
    endRow: Math.max(rowA, rowB),
    endCol: Math.max(colA, colB),
  }
}

// --- Selection shape ---
//
// A selection is a list of non-overlapping rectangles in a canonical form:
// the rows are cut into bands of identical rows, and each band holds one
// rectangle per run of selected cells, ordered top to bottom, left to right.
// Combining selections goes through a bitmap of the bounding box (see
// SelectionBitmap), which the canonical rectangles are read back from.

export function rectSelection(rect: SelectionRect): CellSelection {
  return { rects: [rect] }
}

// The smallest rectangle around every selected cell.
export function selectionBounds(selection: CellSelection): SelectionRect {
  let startRow = Infinity, startCol = Infinity, endRow = -Infinity, endCol = -Infinity
  for (const rect of selection.rects) {
    startRow = Math.min(startRow, rect.startRow)
    startCol = Math.min(startCol, rect.startCol)
    endRow = Math.max(endRow, rect.endRow)
    endCol = Math.max(endCol, rect.endCol)
  }
  return { startRow, startCol, endRow, endCol }
}

export function isCellSelected(selection: CellSelection, row: number, col: number): boolean {
  return selection.rects.some((r) => row >= r.startRow && row <= r.endRow && col >= r.startCol && col <= r.endCol)
}

// One byte per cell of `bounds`, row-major: 1 where the cell is selected.
// Lets code that visits every cell of the bounding box ask "is it selected?"
// in constant time, however many rectangles the selection has.
export class SelectionBitmap {
  readonly bounds: SelectionRect
  readonly width: number
  readonly height: number
  readonly bits: Uint8Array

  constructor(bounds: SelectionRect, rects: readonly SelectionRect[] = []) {
    this.bounds = bounds
    this.width = bounds.endCol - bounds.startCol + 1
    this.height = bounds.endRow - bounds.startRow + 1
    this.bits = new Uint8Array(this.width * this.height)
    for (const rect of rects) this.fill(rect, 1)
  }

  static of(selection: CellSelection): SelectionBitmap {
    return new SelectionBitmap(selectionBounds(selection), selection.rects)
  }

  // Sets every cell of `rect` (clipped to the bounds) to `value`.
  fill(rect: SelectionRect, value: 0 | 1): void {
    const r0 = Math.max(rect.startRow, this.bounds.startRow)
    const r1 = Math.min(rect.endRow, this.bounds.endRow)
    const c0 = Math.max(rect.startCol, this.bounds.startCol) - this.bounds.startCol
    const c1 = Math.min(rect.endCol, this.bounds.endCol) - this.bounds.startCol
    if (c0 > c1) return
    for (let row = r0; row <= r1; row++) {
      const offset = (row - this.bounds.startRow) * this.width
      this.bits.fill(value, offset + c0, offset + c1 + 1)
    }
  }

  has(row: number, col: number): boolean {
    const r = row - this.bounds.startRow
    const c = col - this.bounds.startCol
    return r >= 0 && r < this.height && c >= 0 && c < this.width && this.bits[r * this.width + c] === 1
  }

  // The selected cells as canonical rectangles, or null if none are set.
  toSelection(): CellSelection | null {
    const rects: SelectionRect[] = []
    // The rectangles of the band the previous row belongs to, extended
    // downward for as long as rows keep the exact same runs.
    let band: SelectionRect[] = []
    for (let r = 0; r < this.height; r++) {
      const row = this.bounds.startRow + r
      const runs: [number, number][] = []
      const offset = r * this.width
      for (let c = 0; c < this.width; c++) {
        if (!this.bits[offset + c]) continue
        const start = c
        while (c + 1 < this.width && this.bits[offset + c + 1]) c++
        runs.push([this.bounds.startCol + start, this.bounds.startCol + c])
      }
      const continuesBand =
        band.length === runs.length &&
        band.length > 0 &&
        band.every((rect, i) => rect.startCol === runs[i][0] && rect.endCol === runs[i][1])
      if (continuesBand) {
        for (const rect of band) rect.endRow = row
        continue
      }
      band = runs.map(([startCol, endCol]) => ({ startRow: row, startCol, endRow: row, endCol }))
      rects.push(...band)
    }
    return rects.length > 0 ? { rects } : null
  }
}

function unionBounds(a: SelectionRect, b: SelectionRect): SelectionRect {
  return {
    startRow: Math.min(a.startRow, b.startRow),
    startCol: Math.min(a.startCol, b.startCol),
    endRow: Math.max(a.endRow, b.endRow),
    endCol: Math.max(a.endCol, b.endCol),
  }
}

// Applies a marquee to the selection it was drawn over. Subtracting
// everything (or from nothing) leaves no selection.
export function combineSelection(base: CellSelection | null, rect: SelectionRect, mode: SelectionMode): CellSelection | null {
  if (mode === 'replace' || (mode === 'add' && !base)) return rectSelection(rect)
  if (!base) return null
  const baseBounds = selectionBounds(base)
  const bitmap = new SelectionBitmap(mode === 'add' ? unionBounds(baseBounds, rect) : baseBounds, base.rects)
  bitmap.fill(rect, mode === 'add' ? 1 : 0)
  return bitmap.toSelection()
}

export function translateSelection(selection: CellSelection, dRow: number, dCol: number): CellSelection {
  return {
    rects: selection.rects.map((r) => ({
      startRow: r.startRow + dRow,
      startCol: r.startCol + dCol,
      endRow: r.endRow + dRow,
      endCol: r.endCol + dCol,
    })),
  }
}

// Drops whatever lies off a canvas of the given size.
export function clipSelectionToCanvas(selection: CellSelection, canvasWidth: number, canvasHeight: number): CellSelection | null {
  const rects: SelectionRect[] = []
  for (const r of selection.rects) {
    const clipped = {
      startRow: Math.max(0, r.startRow),
      startCol: Math.max(0, r.startCol),
      endRow: Math.min(canvasHeight - 1, r.endRow),
      endCol: Math.min(canvasWidth - 1, r.endCol),
    }
    if (clipped.startRow <= clipped.endRow && clipped.startCol <= clipped.endCol) rects.push(clipped)
  }
  return rects.length > 0 ? { rects } : null
}

// The selection flipped left-to-right within its bounding box - where its
// contents land when they are mirrored.
export function mirrorSelection(selection: CellSelection): CellSelection {
  const { startCol, endCol } = selectionBounds(selection)
  const mirrored = selection.rects.map((r) => ({
    startRow: r.startRow,
    startCol: startCol + endCol - r.endCol,
    endRow: r.endRow,
    endCol: startCol + endCol - r.startCol,
  }))
  return SelectionBitmap.of({ rects: mirrored }).toSelection() ?? { rects: mirrored }
}

export function selectionsEqual(a: CellSelection, b: CellSelection): boolean {
  return (
    a.rects.length === b.rects.length &&
    a.rects.every((r, i) => {
      const o = b.rects[i]
      return r.startRow === o.startRow && r.startCol === o.startCol && r.endRow === o.endRow && r.endCol === o.endCol
    })
  )
}

// The selection's border as an SVG path, with `scale` units per cell and
// (0, 0) at the bounding box's top-left corner: one segment per run of cell
// edges that has a selected cell on one side and none on the other.
export function selectionOutlinePath(selection: CellSelection, scale: number): string {
  const bitmap = SelectionBitmap.of(selection)
  const { width, height, bits } = bitmap
  const at = (r: number, c: number) => r >= 0 && r < height && c >= 0 && c < width && bits[r * width + c] === 1
  const parts: string[] = []
  // Horizontal edges, along the top of row r.
  for (let r = 0; r <= height; r++) {
    for (let c = 0; c < width; c++) {
      if (at(r - 1, c) === at(r, c)) continue
      const start = c
      while (c + 1 < width && at(r - 1, c + 1) !== at(r, c + 1)) c++
      parts.push(`M${start * scale} ${r * scale}H${(c + 1) * scale}`)
    }
  }
  // Vertical edges, along the left of column c.
  for (let c = 0; c <= width; c++) {
    for (let r = 0; r < height; r++) {
      if (at(r, c - 1) === at(r, c)) continue
      const start = r
      while (r + 1 < height && at(r + 1, c - 1) !== at(r + 1, c)) r++
      parts.push(`M${c * scale} ${start * scale}V${(r + 1) * scale}`)
    }
  }
  return parts.join('')
}

// The selected area as an SVG path (for filling), in the same units as
// selectionOutlinePath.
export function selectionAreaPath(selection: CellSelection, scale: number): string {
  const { startRow, startCol } = selectionBounds(selection)
  return selection.rects
    .map((r) => {
      const w = (r.endCol - r.startCol + 1) * scale
      const h = (r.endRow - r.startRow + 1) * scale
      return `M${(r.startCol - startCol) * scale} ${(r.startRow - startRow) * scale}h${w}v${h}h${-w}Z`
    })
    .join('')
}

function forEachCell(selection: CellSelection, fn: (row: number, col: number) => void): void {
  for (const rect of selection.rects) {
    for (let row = rect.startRow; row <= rect.endRow; row++) {
      for (let col = rect.startCol; col <= rect.endCol; col++) fn(row, col)
    }
  }
}

// --- Pixel-grid operations ---

// Snapshots the selected cells (empty ones become TRANSPARENT) so a paste
// fully overwrites the selected area, matching raster clipboard behavior,
// while leaving the unselected parts of the bounding box alone.
export function copySelectionCells(
  grid: { [key: string]: string },
  selection: CellSelection
): ClipboardData {
  const bounds = selectionBounds(selection)
  const cells: { [key: string]: string } = {}
  forEachCell(selection, (row, col) => {
    cells[`${row - bounds.startRow},${col - bounds.startCol}`] = grid[`${row},${col}`] || TRANSPARENT
  })
  return {
    width: bounds.endCol - bounds.startCol + 1,
    height: bounds.endRow - bounds.startRow + 1,
    rects: translateSelection(selection, -bounds.startRow, -bounds.startCol).rects,
    cells,
  }
}

export function clearSelectionFromGrid(
  grid: { [key: string]: string },
  selection: CellSelection
): { [key: string]: string } {
  const newGrid = { ...grid }
  forEachCell(selection, (row, col) => {
    delete newGrid[`${row},${col}`]
  })
  return newGrid
}

// Writes the clipboard's cells - only those, so a shaped selection leaves the
// rest of its bounding box untouched - with its top-left corner at the target.
export function pasteClipboardToGrid(
  grid: { [key: string]: string },
  clipboard: ClipboardData,
  targetRow: number,
  targetCol: number,
  canvasWidth: number,
  canvasHeight: number
): { [key: string]: string } {
  const newGrid = { ...grid }
  for (const relKey in clipboard.cells) {
    const [relRowStr, relColStr] = relKey.split(',')
    const row = targetRow + parseInt(relRowStr, 10)
    const col = targetCol + parseInt(relColStr, 10)
    if (row < 0 || row >= canvasHeight || col < 0 || col >= canvasWidth) continue

    const color = clipboard.cells[relKey]
    if (color === TRANSPARENT) {
      delete newGrid[`${row},${col}`]
    } else {
      newGrid[`${row},${col}`] = color
    }
  }
  return newGrid
}

// Where a paste of `clipboard` at the target lands, as the selection to show
// afterwards.
export function selectionFromClipboard(
  clipboard: ClipboardData,
  targetRow: number,
  targetCol: number,
  canvasWidth: number,
  canvasHeight: number
): CellSelection | null {
  return clipSelectionToCanvas(translateSelection({ rects: clipboard.rects }, targetRow, targetCol), canvasWidth, canvasHeight)
}

// Flips the selected cells left-to-right across the middle of the
// selection's bounding box (see mirrorSelection for where they land). Empty
// cells move too, so the mirrored area is an exact reflection of the
// original - and half-pixels are flipped within their cell as well (top-left
// becomes top-right, and so on).
export function mirrorSelectionHorizontally(
  grid: { [key: string]: string },
  selection: CellSelection
): { [key: string]: string } {
  const { startCol, endCol } = selectionBounds(selection)
  const newGrid = clearSelectionFromGrid(clearSelectionFromGrid(grid, selection), mirrorSelection(selection))
  forEachCell(selection, (row, col) => {
    const color = grid[`${row},${col}`]
    if (!color) return
    newGrid[`${row},${startCol + endCol - col}`] = mirrorCellHorizontally(color)
  })
  return newGrid
}
