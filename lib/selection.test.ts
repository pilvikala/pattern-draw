import { describe, it, expect } from 'vitest'
import {
  normalizeRect,
  rectSelection,
  selectionBounds,
  isCellSelected,
  combineSelection,
  translateSelection,
  clipSelectionToCanvas,
  mirrorSelection,
  selectionsEqual,
  selectionOutlinePath,
  selectionAreaPath,
  SelectionBitmap,
  copySelectionCells,
  clearSelectionFromGrid,
  pasteClipboardToGrid,
  selectionFromClipboard,
  mirrorSelectionHorizontally,
} from './selection'
import type { CellSelection, ClipboardData, SelectionRect } from './types'

const rect = (startRow: number, startCol: number, endRow: number, endCol: number): SelectionRect => ({ startRow, startCol, endRow, endCol })
const sel = (...rects: SelectionRect[]): CellSelection => ({ rects })
const clip = (width: number, height: number, cells: { [key: string]: string }): ClipboardData => ({
  width,
  height,
  rects: [rect(0, 0, height - 1, width - 1)],
  cells,
})

// Renders the selected cells as rows of '#' (selected) and '.' over the
// given area, for readable shape assertions.
const picture = (selection: CellSelection | null, rows: number, cols: number): string[] =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (selection && isCellSelected(selection, r, c) ? '#' : '.')).join('')
  )

describe('normalizeRect', () => {
  it('orders corners regardless of drag direction', () => {
    expect(normalizeRect(3, 4, 1, 2)).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 })
    expect(normalizeRect(1, 2, 3, 4)).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 })
  })
})

describe('combineSelection', () => {
  it('replaces the selection with the marquee', () => {
    expect(combineSelection(sel(rect(0, 0, 1, 1)), rect(3, 3, 4, 4), 'replace')).toEqual(sel(rect(3, 3, 4, 4)))
  })

  it('adding to nothing starts a selection; subtracting from nothing leaves none', () => {
    expect(combineSelection(null, rect(1, 1, 2, 2), 'add')).toEqual(sel(rect(1, 1, 2, 2)))
    expect(combineSelection(null, rect(1, 1, 2, 2), 'subtract')).toBeNull()
  })

  it('adds a separate area', () => {
    const result = combineSelection(sel(rect(0, 0, 1, 1)), rect(0, 3, 1, 3), 'add')
    expect(picture(result, 2, 4)).toEqual(['##.#', '##.#'])
    expect(result).toEqual(sel(rect(0, 0, 1, 1), rect(0, 3, 1, 3)))
  })

  it('adds an overlapping area as one shape, in canonical bands', () => {
    const result = combineSelection(sel(rect(0, 0, 1, 1)), rect(1, 1, 2, 2), 'add')
    expect(picture(result, 3, 3)).toEqual(['##.', '###', '.##'])
    expect(result).toEqual(sel(rect(0, 0, 0, 1), rect(1, 0, 1, 2), rect(2, 1, 2, 2)))
  })

  it('merges into a single rect when the union is rectangular', () => {
    expect(combineSelection(sel(rect(0, 0, 1, 1)), rect(0, 2, 1, 3), 'add')).toEqual(sel(rect(0, 0, 1, 3)))
  })

  it('cuts a hole out of the selection', () => {
    const result = combineSelection(sel(rect(0, 0, 2, 2)), rect(1, 1, 1, 1), 'subtract')
    expect(picture(result, 3, 3)).toEqual(['###', '#.#', '###'])
  })

  it('ignores the part of a subtracted marquee outside the selection', () => {
    const result = combineSelection(sel(rect(0, 0, 1, 3)), rect(1, 2, 5, 9), 'subtract')
    expect(picture(result, 2, 4)).toEqual(['####', '##..'])
  })

  it('subtracting everything leaves no selection', () => {
    expect(combineSelection(sel(rect(1, 1, 2, 2)), rect(0, 0, 5, 5), 'subtract')).toBeNull()
  })

  it('does not mutate the base selection', () => {
    const base = sel(rect(0, 0, 2, 2))
    combineSelection(base, rect(1, 1, 1, 1), 'subtract')
    expect(base).toEqual(sel(rect(0, 0, 2, 2)))
  })
})

describe('selection shape helpers', () => {
  const ring = combineSelection(sel(rect(1, 1, 3, 4)), rect(2, 2, 2, 3), 'subtract')!

  it('computes the bounding box', () => {
    expect(selectionBounds(ring)).toEqual(rect(1, 1, 3, 4))
  })

  it('answers cell membership through the bitmap too', () => {
    const bitmap = SelectionBitmap.of(ring)
    expect(bitmap.has(2, 2)).toBe(false)
    expect(bitmap.has(2, 1)).toBe(true)
    expect(bitmap.has(0, 0)).toBe(false)
    expect(bitmap.toSelection()).toEqual(ring)
  })

  it('translates', () => {
    expect(translateSelection(sel(rect(0, 0, 1, 1)), 2, 3)).toEqual(sel(rect(2, 3, 3, 4)))
  })

  it('clips to the canvas, dropping rects entirely off it', () => {
    expect(clipSelectionToCanvas(sel(rect(8, 8, 12, 12), rect(20, 0, 21, 1)), 10, 10)).toEqual(sel(rect(8, 8, 9, 9)))
    expect(clipSelectionToCanvas(sel(rect(20, 20, 21, 21)), 10, 10)).toBeNull()
  })

  it('mirrors the shape within its bounding box', () => {
    const ell = combineSelection(sel(rect(0, 0, 1, 0)), rect(1, 0, 1, 2), 'add')!
    expect(picture(ell, 2, 3)).toEqual(['#..', '###'])
    expect(picture(mirrorSelection(ell), 2, 3)).toEqual(['..#', '###'])
    expect(selectionsEqual(mirrorSelection(ring), ring)).toBe(true)
    expect(selectionsEqual(mirrorSelection(ell), ell)).toBe(false)
  })

  it('outlines a rectangle with its four edges', () => {
    expect(selectionOutlinePath(rectSelection(rect(5, 5, 6, 7)), 10)).toBe('M0 0H30M0 20H30M0 0V20M30 0V20')
  })

  it('outlines a hole as well as the outside', () => {
    const path = selectionOutlinePath(sel(...combineSelection(sel(rect(0, 0, 2, 2)), rect(1, 1, 1, 1), 'subtract')!.rects), 1)
    // Outer square (4 edges) plus the hole's 4 edges.
    expect(path.match(/M/g)).toHaveLength(8)
    expect(path).toContain('M1 1H2')
    expect(path).toContain('M1 2H2')
  })

  it('paths the area relative to the bounding box', () => {
    expect(selectionAreaPath(sel(rect(2, 2, 2, 2), rect(3, 3, 3, 3)), 10)).toBe('M0 0h10v10h-10ZM10 10h10v10h-10Z')
  })
})

describe('copySelectionCells', () => {
  it('extracts a dense snapshot relative to the rect origin, defaulting missing cells to transparent', () => {
    const grid = { '1,1': '#ff0000', '1,2': '#00ff00' }

    const result = copySelectionCells(grid, rectSelection(rect(1, 1, 2, 2)))

    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.rects).toEqual([rect(0, 0, 1, 1)])
    expect(result.cells).toEqual({
      '0,0': '#ff0000',
      '0,1': '#00ff00',
      '1,0': '',
      '1,1': '',
    })
  })

  it('copies only the selected cells of a shaped selection', () => {
    const grid = { '0,0': '#ff0000', '0,1': '#00ff00', '1,1': '#0000ff' }
    const ell = combineSelection(sel(rect(0, 0, 1, 0)), rect(1, 0, 1, 1), 'add')!

    const result = copySelectionCells(grid, ell)

    expect(result).toEqual({
      width: 2,
      height: 2,
      rects: ell.rects,
      cells: { '0,0': '#ff0000', '1,0': '', '1,1': '#0000ff' },
    })
  })

  it('does not mutate the input grid', () => {
    const grid = { '0,0': '#000000' }
    copySelectionCells(grid, rectSelection(rect(0, 0, 0, 0)))
    expect(grid).toEqual({ '0,0': '#000000' })
  })
})

describe('clearSelectionFromGrid', () => {
  it('removes only cells within the selection', () => {
    const grid = { '0,0': '#000000', '0,1': '#ff0000', '1,0': '#00ff00', '1,1': '#0000ff' }
    const result = clearSelectionFromGrid(grid, sel(rect(0, 0, 0, 0), rect(1, 1, 1, 1)))

    expect(result).toEqual({ '0,1': '#ff0000', '1,0': '#00ff00' })
  })

  it('does not mutate the input grid', () => {
    const grid = { '0,0': '#000000' }
    clearSelectionFromGrid(grid, rectSelection(rect(0, 0, 0, 0)))
    expect(grid['0,0']).toBe('#000000')
  })
})

describe('pasteClipboardToGrid', () => {
  it('writes clipboard cells at the target offset', () => {
    const grid: { [key: string]: string } = {}

    const result = pasteClipboardToGrid(grid, clip(2, 1, { '0,0': '#ff0000', '0,1': '#00ff00' }), 3, 4, 10, 10)

    expect(result['3,4']).toBe('#ff0000')
    expect(result['3,5']).toBe('#00ff00')
  })

  it('treats transparent clipboard cells as clearing the target (keeps grid sparse)', () => {
    const grid = { '3,4': '#ff0000' }

    const result = pasteClipboardToGrid(grid, clip(1, 1, { '0,0': '' }), 3, 4, 10, 10)

    expect(result['3,4']).toBeUndefined()
  })

  it('treats an explicit white clipboard cell as a real color, not a clear', () => {
    const grid = { '3,4': '#ff0000' }

    const result = pasteClipboardToGrid(grid, clip(1, 1, { '0,0': '#ffffff' }), 3, 4, 10, 10)

    expect(result['3,4']).toBe('#ffffff')
  })

  it('skips cells that fall outside the canvas bounds', () => {
    const grid: { [key: string]: string } = {}

    const result = pasteClipboardToGrid(grid, clip(2, 1, { '0,0': '#ff0000', '0,1': '#00ff00' }), 0, 9, 10, 10)

    expect(result['0,9']).toBe('#ff0000')
    expect(result['0,10']).toBeUndefined()
  })

  it('a shaped clipboard overwrites only its own cells', () => {
    const grid = { '0,0': '#000000', '0,1': '#000000', '1,0': '#000000', '1,1': '#000000' }
    const ell = combineSelection(sel(rect(0, 0, 1, 0)), rect(1, 0, 1, 1), 'add')!
    const copied = copySelectionCells({ '0,0': '#ff0000' }, ell)

    const result = pasteClipboardToGrid(grid, copied, 0, 0, 10, 10)

    // (0,1) is outside the L, so it keeps what was there; the L's empty
    // cells clear what they land on.
    expect(result).toEqual({ '0,0': '#ff0000', '0,1': '#000000' })
  })

  it('does not mutate the input grid', () => {
    const grid: { [key: string]: string } = {}
    pasteClipboardToGrid(grid, clip(1, 1, { '0,0': '#ff0000' }), 0, 0, 10, 10)
    expect(grid).toEqual({})
  })
})

describe('selectionFromClipboard', () => {
  it('places the clipboard shape at the target, clipped to the canvas', () => {
    const copied = copySelectionCells({}, sel(rect(4, 4, 4, 4), rect(5, 5, 5, 6)))
    expect(selectionFromClipboard(copied, 8, 8, 10, 10)).toEqual(sel(rect(8, 8, 8, 8), rect(9, 9, 9, 9)))
  })
})

describe('mirrorSelectionHorizontally', () => {
  it('flips cells left-to-right within the rect, moving empty cells too', () => {
    const grid = { '0,0': '#ff0000', '0,1': '#00ff00', '1,0': '#0000ff' }
    const result = mirrorSelectionHorizontally(grid, rectSelection(rect(0, 0, 1, 2)))

    expect(result).toEqual({ '0,2': '#ff0000', '0,1': '#00ff00', '1,2': '#0000ff' })
  })

  it('leaves cells outside the rect untouched', () => {
    const grid = { '0,0': '#ff0000', '0,3': '#000000', '2,1': '#00ff00' }
    const result = mirrorSelectionHorizontally(grid, rectSelection(rect(0, 1, 1, 2)))

    expect(result).toEqual(grid)
  })

  it('flips a shaped selection across its bounding box, overwriting where it lands', () => {
    // An L over cols 0-2: (0,0) and the whole of row 1. It lands as a
    // mirrored L, so (0,2) - not selected - is overwritten by (0,0)'s cell,
    // and (0,1) stays as it was.
    const grid = { '0,0': '#ff0000', '0,1': '#00ff00', '0,2': '#000000', '1,0': '#0000ff' }
    const ell = combineSelection(sel(rect(0, 0, 1, 0)), rect(1, 0, 1, 2), 'add')!

    const result = mirrorSelectionHorizontally(grid, ell)

    expect(result).toEqual({ '0,1': '#00ff00', '0,2': '#ff0000', '1,2': '#0000ff' })
  })

  it('does not mutate the input grid', () => {
    const grid = { '0,0': '#000000' }
    mirrorSelectionHorizontally(grid, rectSelection(rect(0, 0, 0, 1)))
    expect(grid).toEqual({ '0,0': '#000000' })
  })

  it('flips half-pixels within their cell', () => {
    const grid = { '0,0': '#ff0000,,,#ff0000' }
    const result = mirrorSelectionHorizontally(grid, rectSelection(rect(0, 0, 0, 1)))
    expect(result).toEqual({ '0,1': '#ff0000,#ff0000,,' })
  })
})
