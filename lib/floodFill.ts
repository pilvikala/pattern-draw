import { TRANSPARENT } from './types'
import { cellQuarters, cellFromQuarters } from './cells'
import type { CellQuarters } from './cells'

// Fills at quarter granularity (the four triangles of each cell - see
// lib/cells.ts) rather than whole cells, so a fill flows into the empty or
// matching half of a half-pixel and stops at its painted half, instead of
// treating the whole half-pixel as a wall. For grids of full pixels this is
// identical to an ordinary 4-connected cell fill.
//
// A quarter touches the two quarters beside it in the same cell (top touches
// right and left, but bottom only at the center point) and the facing
// quarter of the neighboring cell across its edge (top <-> bottom of the
// cell above, right <-> left of the cell to the right, and so on).
//
// `startQuarter` is the quarter that was clicked (0-3: top, right, bottom,
// left); `targetColor` is its current color.
export function floodFillGrid(
  grid: { [key: string]: string },
  startRow: number,
  startCol: number,
  targetColor: string,
  fillColor: string,
  width: number,
  height: number,
  startQuarter: number = 0
): { [key: string]: string } {
  const newGrid = { ...grid }
  if (targetColor === fillColor) return newGrid

  // Quarters of every cell the fill has touched, written back at the end.
  const touched = new Map<string, CellQuarters>()
  const getQuarters = (key: string): CellQuarters => {
    let quarters = touched.get(key)
    if (!quarters) {
      quarters = cellQuarters(newGrid[key])
      touched.set(key, quarters)
    }
    return quarters
  }

  // A flat typed array rather than a Set of string keys - the fill can visit
  // up to four nodes per cell (1,000,000 on a full 500x500 canvas).
  const visited = new Uint8Array(width * height * 4)
  const stack: number[] = [startRow, startCol, startQuarter]

  while (stack.length > 0) {
    const q = stack.pop()!
    const col = stack.pop()!
    const row = stack.pop()!
    if (row < 0 || row >= height || col < 0 || col >= width) continue

    const index = (row * width + col) * 4 + q
    if (visited[index]) continue
    visited[index] = 1

    const quarters = getQuarters(`${row},${col}`)
    if ((quarters[q] || TRANSPARENT) !== targetColor) continue
    quarters[q] = fillColor

    // Neighbors within the cell, then across the edge this quarter lies on.
    stack.push(row, col, (q + 1) % 4, row, col, (q + 3) % 4)
    if (q === 0) stack.push(row - 1, col, 2)
    else if (q === 1) stack.push(row, col + 1, 3)
    else if (q === 2) stack.push(row + 1, col, 0)
    else stack.push(row, col - 1, 1)
  }

  for (const [key, quarters] of touched) {
    const value = cellFromQuarters(quarters)
    if (value) newGrid[key] = value
    else delete newGrid[key]
  }

  return newGrid
}
