import { describe, it, expect } from 'vitest'
import { floodFillGrid } from './floodFill'
import { TRANSPARENT } from './types'

describe('floodFillGrid', () => {
  it('fills all connected cells of the same color, treating missing cells as transparent', () => {
    const grid: { [key: string]: string } = {
      '0,0': '#000000',
      '0,1': '#000000',
      '1,0': '#000000',
      // '1,1' is unfilled (transparent)
    }

    const result = floodFillGrid(grid, 0, 0, '#000000', '#ff0000', 4, 4)

    expect(result['0,0']).toBe('#ff0000')
    expect(result['0,1']).toBe('#ff0000')
    expect(result['1,0']).toBe('#ff0000')
    expect(result['1,1']).toBeUndefined()
  })

  it('does not cross into cells of a different color', () => {
    const grid: { [key: string]: string } = {
      '0,0': '#000000',
      '0,1': '#000000',
      '0,2': '#ff0000',
      '0,3': '#000000',
    }

    const result = floodFillGrid(grid, 0, 0, '#000000', '#00ff00', 4, 1)

    expect(result['0,0']).toBe('#00ff00')
    expect(result['0,1']).toBe('#00ff00')
    expect(result['0,2']).toBe('#ff0000')
    expect(result['0,3']).toBe('#000000')
  })

  it('fills unfilled (transparent) cells within bounds when starting from an unfilled cell', () => {
    const grid: { [key: string]: string } = {
      '1,1': '#000000',
    }

    const result = floodFillGrid(grid, 0, 0, TRANSPARENT, '#0000ff', 3, 3)

    expect(result['0,0']).toBe('#0000ff')
    expect(result['1,0']).toBe('#0000ff')
    expect(result['0,1']).toBe('#0000ff')
    expect(result['2,2']).toBe('#0000ff')
    // The black cell blocks the fill and stays untouched
    expect(result['1,1']).toBe('#000000')
  })

  it('treats an explicitly-painted white cell as distinct from a transparent one', () => {
    const grid: { [key: string]: string } = {
      '0,0': '#ffffff',
      // '0,1' is transparent, not white - the fill should not cross into it
    }

    const result = floodFillGrid(grid, 0, 0, '#ffffff', '#0000ff', 3, 1)

    expect(result['0,0']).toBe('#0000ff')
    expect(result['0,1']).toBeUndefined()
  })

  it('does not mutate the input grid', () => {
    const grid: { [key: string]: string } = { '0,0': '#000000' }
    floodFillGrid(grid, 0, 0, '#000000', '#ff0000', 2, 2)
    expect(grid['0,0']).toBe('#000000')
  })

  describe('half-pixels', () => {
    const RED = '#ff0000'
    const BLUE = '#0000ff'
    const TOP = 0
    const BOTTOM = 2

    it('flows into the empty half of a half-pixel and around its painted half', () => {
      // A top-left red half in the middle of an empty 3x3 canvas.
      const grid = { '1,1': `${RED},,,${RED}` }
      const result = floodFillGrid(grid, 0, 0, TRANSPARENT, BLUE, 3, 3)

      expect(result['1,1']).toBe(`${RED},${BLUE},${BLUE},${RED}`)
      expect(result['0,0']).toBe(BLUE)
      expect(result['2,2']).toBe(BLUE)
    })

    it('fills only the clicked half when starting inside a half-pixel', () => {
      const grid = { '0,0': `${RED},,,${RED}` }
      const result = floodFillGrid(grid, 0, 0, RED, BLUE, 2, 2, TOP)

      expect(result['0,0']).toBe(`${BLUE},,,${BLUE}`)
      expect(result['0,1']).toBeUndefined()
    })

    it('does not leak through a diagonal wall of half-pixels', () => {
      // A "/" line of bottom-right halves cuts off the top-left corner
      // cell from the rest of the canvas.
      const wall = `,${RED},${RED},`
      const grid = { '0,1': wall, '1,0': wall }
      const result = floodFillGrid(grid, 0, 0, TRANSPARENT, BLUE, 3, 3)

      expect(result['0,0']).toBe(BLUE)
      expect(result['0,1']).toBe(`${BLUE},${RED},${RED},${BLUE}`)
      expect(result['1,0']).toBe(`${BLUE},${RED},${RED},${BLUE}`)
      expect(result['1,1']).toBeUndefined()
      expect(result['2,2']).toBeUndefined()
    })

    it('fills the empty half when starting from it', () => {
      const grid = { '0,0': `${RED},,,${RED}` }
      const result = floodFillGrid(grid, 0, 0, TRANSPARENT, BLUE, 1, 1, BOTTOM)

      expect(result['0,0']).toBe(`${RED},${BLUE},${BLUE},${RED}`)
    })

    it('merges the halves back into a full pixel when the fill matches', () => {
      const grid = { '0,0': `${RED},,,${RED}` }
      const result = floodFillGrid(grid, 0, 0, TRANSPARENT, RED, 1, 1, BOTTOM)

      expect(result['0,0']).toBe(RED)
    })
  })
})
