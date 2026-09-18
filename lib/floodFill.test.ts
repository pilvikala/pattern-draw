import { describe, it, expect } from 'vitest'
import { floodFillGrid } from './floodFill'

describe('floodFillGrid', () => {
  it('fills all connected cells of the same color, treating missing cells as white', () => {
    const grid: { [key: string]: string } = {
      '0,0': '#000000',
      '0,1': '#000000',
      '1,0': '#000000',
      // '1,1' is unfilled (white)
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

  it('fills unfilled (white) cells within bounds when starting from an unfilled cell', () => {
    const grid: { [key: string]: string } = {
      '1,1': '#000000',
    }

    const result = floodFillGrid(grid, 0, 0, '#ffffff', '#0000ff', 3, 3)

    expect(result['0,0']).toBe('#0000ff')
    expect(result['1,0']).toBe('#0000ff')
    expect(result['0,1']).toBe('#0000ff')
    expect(result['2,2']).toBe('#0000ff')
    // The black cell blocks the fill and stays untouched
    expect(result['1,1']).toBe('#000000')
  })

  it('does not mutate the input grid', () => {
    const grid: { [key: string]: string } = { '0,0': '#000000' }
    floodFillGrid(grid, 0, 0, '#000000', '#ff0000', 2, 2)
    expect(grid['0,0']).toBe('#000000')
  })
})
