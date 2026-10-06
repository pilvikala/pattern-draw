import { describe, it, expect } from 'vitest'
import {
  paintCell,
  compositeCell,
  mirrorCellHorizontally,
  cellColorAt,
  cellQuarters,
  cellFromQuarters,
  cellBackground,
  normalizeCellValue,
  isSplitCell,
} from './cells'

const RED = '#ff0000'
const BLUE = '#0000ff'

describe('paintCell', () => {
  it('paints a full pixel as a plain color, exactly as before half-pixels', () => {
    expect(paintCell(undefined, RED, 'full')).toBe(RED)
    expect(paintCell(`${BLUE},,,${BLUE}`, RED, 'full')).toBe(RED)
  })

  it('paints each half as two quarters, leaving the rest transparent', () => {
    expect(paintCell(undefined, RED, 'topLeft')).toBe(`${RED},,,${RED}`)
    expect(paintCell(undefined, RED, 'topRight')).toBe(`${RED},${RED},,`)
    expect(paintCell(undefined, RED, 'bottomRight')).toBe(`,${RED},${RED},`)
    expect(paintCell(undefined, RED, 'bottomLeft')).toBe(`,,${RED},${RED}`)
  })

  it('combines two complementary halves of different colors', () => {
    const topLeft = paintCell(undefined, RED, 'topLeft')
    expect(paintCell(topLeft, BLUE, 'bottomRight')).toBe(`${RED},${BLUE},${BLUE},${RED}`)
  })

  it('collapses to a full pixel when both halves share a color', () => {
    const topLeft = paintCell(undefined, RED, 'topLeft')
    expect(paintCell(topLeft, RED, 'bottomRight')).toBe(RED)
  })

  it('paints a half over part of an existing full pixel', () => {
    expect(paintCell(RED, BLUE, 'bottomLeft')).toBe(`${RED},${RED},${BLUE},${BLUE}`)
  })

  it('overlapping halves overwrite the shared quarter', () => {
    const topLeft = paintCell(undefined, RED, 'topLeft')
    expect(paintCell(topLeft, BLUE, 'topRight')).toBe(`${BLUE},${BLUE},,${RED}`)
  })
})

describe('cellQuarters / cellFromQuarters', () => {
  it('expands full and empty cells', () => {
    expect(cellQuarters(RED)).toEqual([RED, RED, RED, RED])
    expect(cellQuarters(undefined)).toEqual(['', '', '', ''])
  })

  it('treats a malformed split value as empty', () => {
    expect(cellQuarters(`${RED},${BLUE}`)).toEqual(['', '', '', ''])
  })

  it('collapses an all-transparent cell to empty', () => {
    expect(cellFromQuarters(['', '', '', ''])).toBe('')
  })
})

describe('compositeCell', () => {
  it('lets a full pixel cover anything', () => {
    expect(compositeCell(`${RED},,,${RED}`, BLUE)).toBe(BLUE)
  })

  it('shows the layer below through the empty half', () => {
    expect(compositeCell(RED, `${BLUE},,,${BLUE}`)).toBe(`${BLUE},${RED},${RED},${BLUE}`)
  })

  it('treats an empty cell above as see-through', () => {
    expect(compositeCell(RED, '')).toBe(RED)
    expect(compositeCell(undefined, undefined)).toBe('')
  })
})

describe('mirrorCellHorizontally', () => {
  it('swaps left and right halves', () => {
    expect(mirrorCellHorizontally(paintCell(undefined, RED, 'topLeft'))).toBe(paintCell(undefined, RED, 'topRight'))
    expect(mirrorCellHorizontally(paintCell(undefined, RED, 'bottomRight'))).toBe(paintCell(undefined, RED, 'bottomLeft'))
  })

  it('leaves full pixels unchanged', () => {
    expect(mirrorCellHorizontally(RED)).toBe(RED)
  })
})

describe('cellColorAt', () => {
  const cell = paintCell(paintCell(undefined, RED, 'topLeft'), BLUE, 'bottomRight')

  it('picks the color of the half under the point', () => {
    expect(cellColorAt(cell, 0.2, 0.2)).toBe(RED)
    expect(cellColorAt(cell, 0.8, 0.8)).toBe(BLUE)
    expect(cellColorAt(cell, 0.5, 0.1)).toBe(RED)
    expect(cellColorAt(cell, 0.9, 0.5)).toBe(BLUE)
  })

  it('returns the transparent sentinel for an empty half', () => {
    expect(cellColorAt(paintCell(undefined, RED, 'topLeft'), 0.8, 0.8)).toBe('')
  })

  it('returns a full pixel color anywhere', () => {
    expect(cellColorAt(RED, 0.9, 0.9)).toBe(RED)
  })
})

describe('cellBackground', () => {
  it('uses a plain color for full pixels and the fallback for empty ones', () => {
    expect(cellBackground(RED, '#fff')).toBe(RED)
    expect(cellBackground('', '#fff')).toBe('#fff')
  })

  it('renders half-pixels as a conic gradient with the fallback in empty quarters', () => {
    const bg = cellBackground(`${RED},,,${RED}`, '#fff')
    expect(bg).toContain('conic-gradient')
    expect(bg).toContain(`${RED} 0deg 90deg`)
    expect(bg).toContain('#fff 90deg 180deg')
  })
})

describe('normalizeCellValue', () => {
  const normalizeColor = (c: string) => (/^#?[0-9a-f]{6}$/i.test(c) ? (c.startsWith('#') ? c : `#${c}`) : null)

  it('accepts and canonicalizes full colors', () => {
    expect(normalizeCellValue('ff0000', normalizeColor)).toBe(RED)
    expect(normalizeCellValue('nope', normalizeColor)).toBeNull()
  })

  it('accepts half-pixels, dropping invalid quarters', () => {
    expect(normalizeCellValue(`ff0000,,,${RED}`, normalizeColor)).toBe(`${RED},,,${RED}`)
    expect(normalizeCellValue(`${RED},bad,,`, normalizeColor)).toBe(`${RED},,,`)
  })

  it('rejects malformed or fully transparent split values', () => {
    expect(normalizeCellValue(`${RED},${RED}`, normalizeColor)).toBeNull()
    expect(normalizeCellValue(',,,', normalizeColor)).toBeNull()
    expect(normalizeCellValue(12, normalizeColor)).toBeNull()
  })

  it('collapses a split value whose quarters all match', () => {
    const value = normalizeCellValue(`${RED},${RED},${RED},${RED}`, normalizeColor)
    expect(value).toBe(RED)
    expect(isSplitCell(value!)).toBe(false)
  })
})
