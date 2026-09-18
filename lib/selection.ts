import type { SelectionRect, ClipboardData } from './types'

export function normalizeRect(rowA: number, colA: number, rowB: number, colB: number): SelectionRect {
  return {
    startRow: Math.min(rowA, rowB),
    startCol: Math.min(colA, colB),
    endRow: Math.max(rowA, rowB),
    endCol: Math.max(colA, colB),
  }
}

// Extracts a dense snapshot of the rect (missing cells become white) so a
// paste always fully overwrites the target area, matching raster clipboard behavior.
export function copySelectionCells(
  grid: { [key: string]: string },
  rect: SelectionRect
): ClipboardData {
  const cells: { [key: string]: string } = {}
  for (let row = rect.startRow; row <= rect.endRow; row++) {
    for (let col = rect.startCol; col <= rect.endCol; col++) {
      cells[`${row - rect.startRow},${col - rect.startCol}`] = grid[`${row},${col}`] || '#ffffff'
    }
  }
  return {
    width: rect.endCol - rect.startCol + 1,
    height: rect.endRow - rect.startRow + 1,
    cells,
  }
}

export function clearRectFromGrid(
  grid: { [key: string]: string },
  rect: SelectionRect
): { [key: string]: string } {
  const newGrid = { ...grid }
  for (let row = rect.startRow; row <= rect.endRow; row++) {
    for (let col = rect.startCol; col <= rect.endCol; col++) {
      delete newGrid[`${row},${col}`]
    }
  }
  return newGrid
}

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
    if (color === '#ffffff') {
      delete newGrid[`${row},${col}`]
    } else {
      newGrid[`${row},${col}`] = color
    }
  }
  return newGrid
}
