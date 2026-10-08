import type { CellSelection, ClipboardData, MatrixPattern, SelectionRect, Stroke } from './types'
import { mirrorSelection, selectionBounds, selectionsEqual, translateSelection } from './selection'

// Pure geometry for freehand layers (see Stroke in lib/types.ts). All
// coordinates are in grid cells, with (0, 0) at the canvas's top-left
// corner. Nothing here touches the DOM or a canvas, so it is all unit
// tested; drawing lives in lib/freehandRender.ts.

// Stroke widths are cells of line thickness. The slider in the UI only
// offers MIN..2, but the bounds a loaded drawing is held to are wider so a
// hand-made or future-version payload with a fatter pen still loads.
export const MIN_STROKE_WIDTH = 0.05
export const MAX_STROKE_WIDTH = 5
export const DEFAULT_STROKE_WIDTH = 0.3

// Bounds that keep a crafted payload from making a single layer arbitrarily
// expensive to composite, serialize, or keep in the undo history - the same
// reasoning as the grid bounds in lib/layers.ts. A real stroke is simplified
// down to a few dozen points, so these are far above anything drawn by hand.
export const MAX_STROKES_PER_LAYER = 10_000
export const MAX_POINTS_PER_STROKE = 5_000
export const MAX_POINTS_PER_LAYER = 200_000

// Coordinates and widths are kept to two decimals (hundredths of a cell):
// more than enough precision for a pen line on a grid whose cells are 10-50
// screen pixels, and it lets the compact format store plain integers that
// read back as exactly the same numbers.
const PRECISION = 100

export function quantize(value: number): number {
  // `+ 0` turns -0 into 0 so a value never serializes or compares as -0.
  return Math.round(value * PRECISION) / PRECISION + 0
}

export function quantizeWidth(value: number): number {
  return Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, quantize(value)))
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

// The area strokes may occupy: the canvas, plus the half-cell the brick
// patterns shift every other row/column by.
export function canvasBounds(pattern: MatrixPattern, canvasWidth: number, canvasHeight: number): Box {
  return {
    x0: 0,
    y0: 0,
    x1: canvasWidth + (pattern === 'bricks' ? 0.5 : 0),
    y1: canvasHeight + (pattern === 'bricksVertical' ? 0.5 : 0),
  }
}

// The region a cell-based selection covers.
export function rectToBox(rect: SelectionRect): Box {
  return { x0: rect.startCol, y0: rect.startRow, x1: rect.endCol + 1, y1: rect.endRow + 1 }
}

export function countStrokePoints(strokes: readonly Stroke[]): number {
  let total = 0
  for (const stroke of strokes) total += stroke.points.length / 2
  return total
}

// Whether a layer's strokes are within the bounds normalizeDrawingData
// enforces. Edits check this before applying: anything over would be cut off
// the next time the drawing is saved or reloaded, losing strokes silently.
export function strokesWithinLimits(strokes: readonly Stroke[]): boolean {
  return strokes.length <= MAX_STROKES_PER_LAYER && countStrokePoints(strokes) <= MAX_POINTS_PER_LAYER
}

// Ramer-Douglas-Peucker on a flat [x0, y0, x1, y1, ...] polyline. A pointer
// reports a point every few pixels, which is far denser than the line needs;
// thinning it keeps strokes small in memory, in undo history, and in the
// share link. Iterative (explicit stack) so a long stroke can't overflow the
// call stack.
export function simplifyPoints(points: number[], epsilon: number): number[] {
  const count = points.length / 2
  if (count <= 2) return points.slice()
  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  const stack: [number, number][] = [[0, count - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDistance = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i * 2], points[i * 2 + 1], points[first * 2], points[first * 2 + 1], points[last * 2], points[last * 2 + 1])
      if (d > maxDistance) {
        maxDistance = d
        index = i
      }
    }
    if (index !== -1 && maxDistance > epsilon) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  const result: number[] = []
  for (let i = 0; i < count; i++) {
    if (keep[i]) result.push(points[i * 2], points[i * 2 + 1])
  }
  return result
}

export function distanceToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0
  const dy = y1 - y0
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSquared))
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))
}

// Distance from a point to the stroke's center line.
export function distanceToStroke(stroke: Stroke, x: number, y: number): number {
  const { points } = stroke
  if (points.length < 4) return Math.hypot(x - points[0], y - points[1])
  let best = Infinity
  for (let i = 0; i + 3 < points.length; i += 2) {
    best = Math.min(best, distanceToSegment(x, y, points[i], points[i + 1], points[i + 2], points[i + 3]))
  }
  return best
}

// Removes every stroke a circle of `radius` cells around (x, y) touches -
// an eraser that works on whole strokes, since a stroke is one line rather
// than a set of cells. Returns the very same array when nothing was hit so
// callers can tell a no-op apart without comparing contents.
export function eraseStrokesAt(strokes: Stroke[], x: number, y: number, radius: number): Stroke[] {
  const kept = strokes.filter((stroke) => distanceToStroke(stroke, x, y) > radius + stroke.width / 2)
  return kept.length === strokes.length ? strokes : kept
}

// The color of the topmost stroke under (x, y), or null if none covers it.
export function strokeColorAt(strokes: readonly Stroke[], x: number, y: number): string | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (distanceToStroke(strokes[i], x, y) <= strokes[i].width / 2) return strokes[i].color
  }
  return null
}

const EPSILON = 1e-9

function boxContains(box: Box, x: number, y: number): boolean {
  return x >= box.x0 - EPSILON && x <= box.x1 + EPSILON && y >= box.y0 - EPSILON && y <= box.y1 + EPSILON
}

// Splits one stroke along the edges of `box` into the parts inside it and
// the parts outside it. Each segment is cut wherever it crosses an edge and
// every piece is classified by its midpoint, so the two sets together cover
// exactly the original line. Cut ends are round-capped like any other end.
function clipStroke(stroke: Stroke, box: Box): { inside: Stroke[]; outside: Stroke[] } {
  const { points } = stroke
  if (points.length < 4) {
    return boxContains(box, points[0], points[1]) ? { inside: [stroke], outside: [] } : { inside: [], outside: [stroke] }
  }

  // Fast paths keep untouched strokes as the very same object.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i])
    maxX = Math.max(maxX, points[i])
    minY = Math.min(minY, points[i + 1])
    maxY = Math.max(maxY, points[i + 1])
  }
  if (boxContains(box, minX, minY) && boxContains(box, maxX, maxY)) return { inside: [stroke], outside: [] }
  if (maxX < box.x0 || minX > box.x1 || maxY < box.y0 || minY > box.y1) return { inside: [], outside: [stroke] }

  const insideRuns: number[][] = []
  const outsideRuns: number[][] = []
  let run: number[] | null = null
  let runIsInside = false

  const addPiece = (isInside: boolean, ax: number, ay: number, bx: number, by: number) => {
    const x0 = quantize(ax), y0 = quantize(ay), x1 = quantize(bx), y1 = quantize(by)
    if (x0 === x1 && y0 === y1) return // collapsed to nothing at this precision
    if (!run || runIsInside !== isInside) {
      run = [x0, y0, x1, y1]
      runIsInside = isInside
      ;(isInside ? insideRuns : outsideRuns).push(run)
      return
    }
    const lastX = run[run.length - 2]
    const lastY = run[run.length - 1]
    if (lastX !== x0 || lastY !== y0) run.push(x0, y0)
    run.push(x1, y1)
  }

  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i], ay = points[i + 1], bx = points[i + 2], by = points[i + 3]
    const ts = [0, 1]
    for (const bound of [box.x0, box.x1]) {
      if (ax !== bx) {
        const t = (bound - ax) / (bx - ax)
        if (t > 0 && t < 1) ts.push(t)
      }
    }
    for (const bound of [box.y0, box.y1]) {
      if (ay !== by) {
        const t = (bound - ay) / (by - ay)
        if (t > 0 && t < 1) ts.push(t)
      }
    }
    ts.sort((a, b) => a - b)
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1]
      if (t1 - t0 < 1e-12) continue
      const tm = (t0 + t1) / 2
      addPiece(
        boxContains(box, ax + (bx - ax) * tm, ay + (by - ay) * tm),
        ax + (bx - ax) * t0, ay + (by - ay) * t0,
        ax + (bx - ax) * t1, ay + (by - ay) * t1,
      )
    }
  }

  const toStroke = (flat: number[]): Stroke => ({ color: stroke.color, width: stroke.width, points: flat })
  return { inside: insideRuns.map(toStroke), outside: outsideRuns.map(toStroke) }
}

export function clipStrokes(strokes: readonly Stroke[], box: Box): { inside: Stroke[]; outside: Stroke[] } {
  const inside: Stroke[] = []
  const outside: Stroke[] = []
  for (const stroke of strokes) {
    const parts = clipStroke(stroke, box)
    inside.push(...parts.inside)
    outside.push(...parts.outside)
  }
  return { inside, outside }
}

export function translateStrokes(strokes: readonly Stroke[], dx: number, dy: number): Stroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((v, i) => quantize(v + (i % 2 === 0 ? dx : dy))),
  }))
}

// The selection-based operations below mirror the ones in lib/selection.ts
// for pixel grids, so the select tool behaves the same on both kinds of layer.

// Splits strokes into what lies inside the selection and what lies outside
// it, rectangle by rectangle (they don't overlap, so every piece lands once).
export function clipStrokesToSelection(strokes: readonly Stroke[], selection: CellSelection): { inside: Stroke[]; outside: Stroke[] } {
  const inside: Stroke[] = []
  let outside: Stroke[] = [...strokes]
  for (const rect of selection.rects) {
    const parts = clipStrokes(outside, rectToBox(rect))
    inside.push(...parts.inside)
    outside = parts.outside
  }
  return { inside, outside }
}

// What the selection holds, relative to its bounding box's top-left corner.
export function copyStrokesInSelection(strokes: readonly Stroke[], selection: CellSelection): ClipboardData {
  const bounds = selectionBounds(selection)
  const { inside } = clipStrokesToSelection(strokes, selection)
  return {
    width: bounds.endCol - bounds.startCol + 1,
    height: bounds.endRow - bounds.startRow + 1,
    rects: translateSelection(selection, -bounds.startRow, -bounds.startCol).rects,
    cells: {},
    strokes: translateStrokes(inside, -bounds.startCol, -bounds.startRow),
  }
}

export function clearStrokesInSelection(strokes: readonly Stroke[], selection: CellSelection): Stroke[] {
  return clipStrokesToSelection(strokes, selection).outside
}

// Like a pixel paste, this overwrites the copied area (whatever was there is
// cleared first) and drops whatever lands off the canvas.
export function pasteStrokes(strokes: readonly Stroke[], clip: ClipboardData, targetRow: number, targetCol: number, bounds: Box): Stroke[] {
  const target = translateSelection({ rects: clip.rects }, targetRow, targetCol)
  const kept = clipStrokesToSelection(strokes, target).outside
  const pasted = clipStrokes(translateStrokes(clip.strokes ?? [], targetCol, targetRow), bounds).inside
  return [...kept, ...pasted]
}

// Moves everything inside the selection by whole cells, overwriting the area
// it lands on.
export function moveStrokesInSelection(strokes: readonly Stroke[], selection: CellSelection, deltaRow: number, deltaCol: number, bounds: Box): Stroke[] {
  const { inside, outside } = clipStrokesToSelection(strokes, selection)
  const kept = clipStrokesToSelection(outside, translateSelection(selection, deltaRow, deltaCol)).outside
  const moved = clipStrokes(translateStrokes(inside, deltaCol, deltaRow), bounds).inside
  return [...kept, ...moved]
}

// Flips what's inside the selection left-to-right across the middle of its
// bounding box, overwriting what was where it lands (see mirrorSelection).
export function mirrorStrokesInSelection(strokes: readonly Stroke[], selection: CellSelection): Stroke[] {
  const { inside, outside } = clipStrokesToSelection(strokes, selection)
  const { startCol, endCol } = selectionBounds(selection)
  const axis = startCol + endCol + 1
  const mirrored = inside.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((v, i) => (i % 2 === 0 ? quantize(axis - v) : v)),
  }))
  const landing = mirrorSelection(selection)
  const kept = selectionsEqual(landing, selection) ? outside : clipStrokesToSelection(outside, landing).outside
  return [...kept, ...mirrored]
}

// Used when the canvas is resized: shifts everything and drops what no
// longer fits, like the cell shift for pixel layers.
export function shiftStrokes(strokes: readonly Stroke[], dx: number, dy: number, bounds: Box): Stroke[] {
  return clipStrokes(translateStrokes(strokes, dx, dy), bounds).inside
}
