import { describe, it, expect } from 'vitest'
import { normalizeRect, copySelectionCells, clearRectFromGrid, pasteClipboardToGrid } from './selection'

describe('normalizeRect', () => {
  it('orders corners regardless of drag direction', () => {
    expect(normalizeRect(3, 4, 1, 2)).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 })
    expect(normalizeRect(1, 2, 3, 4)).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 })
  })
})

describe('copySelectionCells', () => {
  it('extracts a dense snapshot relative to the rect origin, defaulting missing cells to transparent', () => {
    const grid = { '1,1': '#ff0000', '1,2': '#00ff00' }
    const rect = { startRow: 1, startCol: 1, endRow: 2, endCol: 2 }

    const result = copySelectionCells(grid, rect)

    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.cells).toEqual({
      '0,0': '#ff0000',
      '0,1': '#00ff00',
      '1,0': '',
      '1,1': '',
    })
  })

  it('does not mutate the input grid', () => {
    const grid = { '0,0': '#000000' }
    copySelectionCells(grid, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    expect(grid).toEqual({ '0,0': '#000000' })
  })
})

describe('clearRectFromGrid', () => {
  it('removes only cells within the rect', () => {
    const grid = { '0,0': '#000000', '0,1': '#ff0000', '1,0': '#00ff00' }
    const result = clearRectFromGrid(grid, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 })

    expect(result['0,0']).toBeUndefined()
    expect(result['0,1']).toBe('#ff0000')
    expect(result['1,0']).toBe('#00ff00')
  })

  it('does not mutate the input grid', () => {
    const grid = { '0,0': '#000000' }
    clearRectFromGrid(grid, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    expect(grid['0,0']).toBe('#000000')
  })
})

describe('pasteClipboardToGrid', () => {
  it('writes clipboard cells at the target offset', () => {
    const grid: { [key: string]: string } = {}
    const clipboard = { width: 2, height: 1, cells: { '0,0': '#ff0000', '0,1': '#00ff00' } }

    const result = pasteClipboardToGrid(grid, clipboard, 3, 4, 10, 10)

    expect(result['3,4']).toBe('#ff0000')
    expect(result['3,5']).toBe('#00ff00')
  })

  it('treats transparent clipboard cells as clearing the target (keeps grid sparse)', () => {
    const grid = { '3,4': '#ff0000' }
    const clipboard = { width: 1, height: 1, cells: { '0,0': '' } }

    const result = pasteClipboardToGrid(grid, clipboard, 3, 4, 10, 10)

    expect(result['3,4']).toBeUndefined()
  })

  it('treats an explicit white clipboard cell as a real color, not a clear', () => {
    const grid = { '3,4': '#ff0000' }
    const clipboard = { width: 1, height: 1, cells: { '0,0': '#ffffff' } }

    const result = pasteClipboardToGrid(grid, clipboard, 3, 4, 10, 10)

    expect(result['3,4']).toBe('#ffffff')
  })

  it('skips cells that fall outside the canvas bounds', () => {
    const grid: { [key: string]: string } = {}
    const clipboard = { width: 2, height: 1, cells: { '0,0': '#ff0000', '0,1': '#00ff00' } }

    const result = pasteClipboardToGrid(grid, clipboard, 0, 9, 10, 10)

    expect(result['0,9']).toBe('#ff0000')
    expect(result['0,10']).toBeUndefined()
  })

  it('does not mutate the input grid', () => {
    const grid: { [key: string]: string } = {}
    const clipboard = { width: 1, height: 1, cells: { '0,0': '#ff0000' } }
    pasteClipboardToGrid(grid, clipboard, 0, 0, 10, 10)
    expect(grid).toEqual({})
  })
})
