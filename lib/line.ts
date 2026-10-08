export interface CellPos {
  row: number
  col: number
}

// The end cell of a straight line from `start` toward `target`, snapped to the
// nearest of the 8 directions (horizontal, vertical, the four diagonals) and
// kept inside the canvas. Works on cell indices, so on the brick patterns a
// "diagonal" is a diagonal of the index grid.
export function snapLineEnd(start: CellPos, target: CellPos, rows: number, cols: number): CellPos {
  const dx = target.col - start.col
  const dy = target.row - start.row
  if (dx === 0 && dy === 0) return start

  const step = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  const sx = Math.round(Math.cos(step)) || 0
  const sy = Math.round(Math.sin(step)) || 0

  // How far along the snapped direction the target reaches. A diagonal step
  // moves one cell on both axes, so its projection counts half as much.
  const projection = sx * dx + sy * dy
  let length = Math.max(0, Math.round(sx !== 0 && sy !== 0 ? projection / 2 : projection))

  const room = (delta: number, pos: number, size: number) => (delta > 0 ? size - 1 - pos : delta < 0 ? pos : Infinity)
  length = Math.min(length, room(sx, start.col, cols), room(sy, start.row, rows))

  return { row: start.row + sy * length, col: start.col + sx * length }
}

// Every cell on the straight (horizontal, vertical or 45-degree) line from
// `start` to `end`, both included, in order from `start`.
export function lineCells(start: CellPos, end: CellPos): CellPos[] {
  const dx = end.col - start.col
  const dy = end.row - start.row
  const length = Math.max(Math.abs(dx), Math.abs(dy))
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const cells: CellPos[] = []
  for (let i = 0; i <= length; i++) cells.push({ row: start.row + sy * i, col: start.col + sx * i })
  return cells
}
