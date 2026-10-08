import { describe, it, expect } from 'vitest'
import {
  canvasBounds,
  clearStrokesInSelection,
  clipStrokes,
  clipStrokesToSelection,
  copyStrokesInSelection,
  countStrokePoints,
  distanceToStroke,
  eraseStrokesAt,
  MAX_POINTS_PER_STROKE,
  mirrorStrokesInSelection,
  moveStrokesInSelection,
  pasteStrokes,
  quantize,
  rectToBox,
  shiftStrokes,
  simplifyPoints,
  strokeColorAt,
  translateStrokes,
} from './strokes'
import type { CellSelection, SelectionRect, Stroke } from './types'

const line = (points: number[], color = '#ff0000', width = 0.4): Stroke => ({ color, width, points })
const rect = (startRow: number, startCol: number, endRow: number, endCol: number): SelectionRect => ({ startRow, startCol, endRow, endCol })
const sel = (...rects: SelectionRect[]): CellSelection => ({ rects })
const bounds = canvasBounds('squares', 20, 20)

describe('quantize', () => {
  it('rounds to hundredths and never returns -0', () => {
    expect(quantize(1.23456)).toBe(1.23)
    expect(Object.is(quantize(-0.001), 0)).toBe(true)
  })
})

describe('simplifyPoints', () => {
  it('drops points that lie on a straight line within the tolerance', () => {
    expect(simplifyPoints([0, 0, 1, 0.001, 2, 0, 3, 0], 0.05)).toEqual([0, 0, 3, 0])
  })

  it('keeps the corners of a polyline', () => {
    expect(simplifyPoints([0, 0, 5, 0, 5, 5], 0.05)).toEqual([0, 0, 5, 0, 5, 5])
  })

  it('leaves a dot and a two-point line alone', () => {
    expect(simplifyPoints([1, 2], 0.05)).toEqual([1, 2])
    expect(simplifyPoints([1, 2, 3, 4], 0.05)).toEqual([1, 2, 3, 4])
  })

  it('handles a stroke of the maximum length without overflowing the stack', () => {
    // A zig-zag keeps every point, the worst case for the recursion depth.
    const points: number[] = []
    for (let i = 0; i < MAX_POINTS_PER_STROKE; i++) points.push(i * 0.01, i % 2 ? 0.5 : 0)
    expect(simplifyPoints(points, 0.01)).toHaveLength(points.length)
  })
})

describe('hit testing', () => {
  const stroke = line([0, 0, 10, 0], '#ff0000', 1)

  it('measures distance to the center line, including past the ends', () => {
    expect(distanceToStroke(stroke, 5, 3)).toBe(3)
    expect(distanceToStroke(stroke, 13, 4)).toBe(5)
    expect(distanceToStroke(line([2, 2]), 5, 6)).toBe(5)
  })

  it('finds the topmost stroke color under a point', () => {
    const strokes = [line([0, 0, 10, 0], '#111111', 1), line([5, -5, 5, 5], '#222222', 1)]
    expect(strokeColorAt(strokes, 5, 0)).toBe('#222222')
    expect(strokeColorAt(strokes, 1, 0.4)).toBe('#111111')
    expect(strokeColorAt(strokes, 1, 2)).toBeNull()
  })

  it('erases only the strokes the eraser touches', () => {
    const strokes = [line([0, 0, 10, 0], '#111111', 0.2), line([0, 8, 10, 8], '#222222', 0.2)]
    const result = eraseStrokesAt(strokes, 5, 0.3, 0.3)
    expect(result).toEqual([strokes[1]])
  })

  it('returns the same array when nothing was erased', () => {
    const strokes = [line([0, 0, 10, 0])]
    expect(eraseStrokesAt(strokes, 5, 9, 0.5)).toBe(strokes)
  })

  it('counts a stroke as hit when the eraser overlaps its thickness, not just its center', () => {
    const strokes = [line([0, 0, 10, 0], '#111111', 2)]
    expect(eraseStrokesAt(strokes, 5, 1.2, 0.3)).toEqual([])
  })
})

describe('clipStrokes', () => {
  const box = { x0: 2, y0: 0, x1: 4, y1: 10 }

  it('splits a line crossing a box into the parts inside and outside', () => {
    const { inside, outside } = clipStrokes([line([0, 5, 6, 5])], box)
    expect(inside.map((s) => s.points)).toEqual([[2, 5, 4, 5]])
    expect(outside.map((s) => s.points)).toEqual([[0, 5, 2, 5], [4, 5, 6, 5]])
  })

  it('keeps color and width on every piece', () => {
    const { inside, outside } = clipStrokes([line([0, 5, 6, 5], '#00ff00', 0.7)], box)
    for (const s of [...inside, ...outside]) {
      expect(s.color).toBe('#00ff00')
      expect(s.width).toBe(0.7)
    }
  })

  it('returns untouched strokes as the same object', () => {
    const inner = line([2.5, 1, 3, 2])
    const far = line([8, 1, 9, 2])
    const { inside, outside } = clipStrokes([inner, far], box)
    expect(inside[0]).toBe(inner)
    expect(outside[0]).toBe(far)
  })

  it('keeps a polyline that bends back into the box as separate runs', () => {
    const { inside } = clipStrokes([line([3, 5, 6, 5, 6, 6, 3, 6])], box)
    expect(inside.map((s) => s.points)).toEqual([[3, 5, 4, 5], [4, 6, 3, 6]])
  })

  it('classifies a dot by its position', () => {
    const { inside, outside } = clipStrokes([line([3, 3]), line([9, 9])], box)
    expect(inside).toHaveLength(1)
    expect(outside).toHaveLength(1)
  })

  it('does not lose or invent length: pieces add up to the original', () => {
    const original = line([0, 0, 7, 3, 1, 9, 8, 8])
    const { inside, outside } = clipStrokes([original], box)
    const length = (s: Stroke) => {
      let total = 0
      for (let i = 0; i + 3 < s.points.length; i += 2) total += Math.hypot(s.points[i + 2] - s.points[i], s.points[i + 3] - s.points[i + 1])
      return total
    }
    const parts = [...inside, ...outside].reduce((sum, s) => sum + length(s), 0)
    expect(parts).toBeCloseTo(length(original), 1)
  })
})

describe('selection operations', () => {
  it('copies what is inside the selection relative to its top-left corner', () => {
    const clip = copyStrokesInSelection([line([3, 3, 4, 3])], sel(rect(2, 2, 5, 5)))
    expect(clip).toMatchObject({ width: 4, height: 4, cells: {} })
    expect(clip.strokes?.map((s) => s.points)).toEqual([[1, 1, 2, 1]])
  })

  it('clears only the selected region', () => {
    const result = clearStrokesInSelection([line([0, 1, 10, 1])], sel(rect(0, 3, 3, 5)))
    expect(result.map((s) => s.points)).toEqual([[0, 1, 3, 1], [6, 1, 10, 1]])
  })

  it('pastes at the target, overwriting what was there', () => {
    const clip = copyStrokesInSelection([line([1, 1, 2, 1], '#00ff00')], sel(rect(0, 0, 3, 3)))
    const existing = [line([10, 10, 11, 10], '#ff0000'), line([6, 6, 12, 6], '#0000ff')]
    const result = pasteStrokes(existing, clip, 5, 10, bounds)
    // The red line is below the 4x4 target (cols 10-13, rows 5-8) and stays;
    // the blue line is cut where the target covers it; the paste goes on top.
    expect(result.map((s) => [s.color, s.points])).toEqual([
      ['#ff0000', [10, 10, 11, 10]],
      ['#0000ff', [6, 6, 10, 6]],
      ['#00ff00', [11, 6, 12, 6]],
    ])
  })

  it('drops pasted strokes that fall off the canvas', () => {
    const clip = copyStrokesInSelection([line([0, 0, 3, 0])], sel(rect(0, 0, 3, 3)))
    expect(pasteStrokes([], clip, 0, 18, bounds).map((s) => s.points)).toEqual([[18, 0, 20, 0]])
    expect(pasteStrokes([], clip, 0, 25, bounds)).toEqual([])
  })

  it('moves the selected part by whole cells and leaves the rest', () => {
    const result = moveStrokesInSelection([line([0, 1, 6, 1])], sel(rect(0, 2, 3, 3)), 2, 5, bounds)
    const points = result.map((s) => s.points)
    expect(points).toContainEqual([0, 1, 2, 1])
    expect(points).toContainEqual([4, 1, 6, 1])
    expect(points).toContainEqual([7, 3, 9, 3])
  })

  it('mirrors the selected part about the selection center', () => {
    const result = mirrorStrokesInSelection([line([2, 1, 3, 2])], sel(rect(0, 2, 3, 5)))
    expect(result.map((s) => s.points)).toEqual([[6, 1, 5, 2]])
  })

  it('shifts strokes and drops what leaves the canvas', () => {
    const result = shiftStrokes([line([0, 1, 4, 1])], -2, 0, bounds)
    expect(result.map((s) => s.points)).toEqual([[0, 1, 2, 1]])
  })

  it('translates and counts', () => {
    const moved = translateStrokes([line([0, 0, 1, 1])], 0.5, 2)
    expect(moved[0].points).toEqual([0.5, 2, 1.5, 3])
    expect(countStrokePoints(moved)).toBe(2)
  })

  it('splits a stroke across a shaped selection rect by rect', () => {
    // Cols 0-1 and 4-5 of row 0 are selected; the line crosses both and the
    // gap between them.
    const { inside, outside } = clipStrokesToSelection([line([0, 0.5, 6, 0.5])], sel(rect(0, 0, 0, 1), rect(0, 4, 0, 5)))
    expect(inside.map((s) => s.points)).toEqual([[0, 0.5, 2, 0.5], [4, 0.5, 6, 0.5]])
    expect(outside.map((s) => s.points)).toEqual([[2, 0.5, 4, 0.5]])
  })

  it('copies a shaped selection with its shape, and pastes over only that shape', () => {
    const shape = sel(rect(0, 0, 0, 0), rect(0, 2, 0, 2))
    const clip = copyStrokesInSelection([line([0, 0.5, 3, 0.5], '#00ff00')], shape)
    expect(clip.rects).toEqual(shape.rects)
    expect(clip.strokes?.map((s) => s.points)).toEqual([[0, 0.5, 1, 0.5], [2, 0.5, 3, 0.5]])
    // The blue line under the gap (col 1) survives the paste.
    const result = pasteStrokes([line([0, 0.5, 3, 0.5], '#0000ff')], clip, 0, 0, bounds)
    expect(result.filter((s) => s.color === '#0000ff').map((s) => s.points)).toEqual([[1, 0.5, 2, 0.5]])
  })

  it('mirrors a shaped selection and overwrites where it lands', () => {
    // An L: (0,0) and row 1, cols 0-2. The stroke in (0,0) lands in (0,2),
    // clearing the unselected stroke that was there.
    const ell = sel(rect(0, 0, 0, 0), rect(1, 0, 1, 2))
    const result = mirrorStrokesInSelection([line([0.2, 0.5, 0.8, 0.5]), line([2.2, 0.5, 2.8, 0.5], '#0000ff')], ell)
    expect(result.map((s) => [s.color, s.points])).toEqual([['#ff0000', [2.8, 0.5, 2.2, 0.5]]])
  })

  it('maps a selection rect to the region it covers', () => {
    expect(rectToBox(rect(1, 2, 3, 4))).toEqual({ x0: 2, y0: 1, x1: 5, y1: 4 })
  })
})

describe('canvasBounds', () => {
  it('adds the half-cell the brick patterns shift by', () => {
    expect(canvasBounds('squares', 10, 8)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 8 })
    expect(canvasBounds('bricks', 10, 8)).toEqual({ x0: 0, y0: 0, x1: 10.5, y1: 8 })
    expect(canvasBounds('bricksVertical', 10, 8)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 8.5 })
  })
})
