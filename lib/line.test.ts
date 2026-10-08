import { describe, it, expect } from 'vitest'
import { lineCells, snapLineEnd } from './line'

const at = (row: number, col: number) => ({ row, col })

describe('snapLineEnd', () => {
  it('returns the start when the target is the start', () => {
    expect(snapLineEnd(at(3, 3), at(3, 3), 10, 10)).toEqual(at(3, 3))
  })

  it('snaps near-horizontal and near-vertical targets onto the axis', () => {
    expect(snapLineEnd(at(5, 2), at(6, 8), 20, 20)).toEqual(at(5, 8))
    expect(snapLineEnd(at(5, 2), at(11, 3), 20, 20)).toEqual(at(11, 2))
    expect(snapLineEnd(at(5, 5), at(5, 1), 20, 20)).toEqual(at(5, 1))
    expect(snapLineEnd(at(5, 5), at(0, 5), 20, 20)).toEqual(at(0, 5))
  })

  it('snaps diagonal-ish targets onto the diagonal in all four directions', () => {
    expect(snapLineEnd(at(5, 5), at(9, 10), 20, 20)).toEqual(at(10, 10))
    expect(snapLineEnd(at(5, 5), at(2, 9), 20, 20)).toEqual(at(1, 9))
    expect(snapLineEnd(at(5, 5), at(8, 1), 20, 20)).toEqual(at(9, 1))
    expect(snapLineEnd(at(5, 5), at(2, 2), 20, 20)).toEqual(at(2, 2))
  })

  it('keeps a diagonal inside the canvas', () => {
    // dx=5, dy=3 snaps to the down-right diagonal, but only 1 row is left.
    expect(snapLineEnd(at(8, 0), at(11, 5), 10, 20)).toEqual(at(9, 1))
  })
})

describe('lineCells', () => {
  it('lists a single cell for a zero-length line', () => {
    expect(lineCells(at(2, 2), at(2, 2))).toEqual([at(2, 2)])
  })

  it('walks horizontal, vertical and diagonal lines from the start', () => {
    expect(lineCells(at(1, 3), at(1, 1))).toEqual([at(1, 3), at(1, 2), at(1, 1)])
    expect(lineCells(at(0, 0), at(2, 0))).toEqual([at(0, 0), at(1, 0), at(2, 0)])
    expect(lineCells(at(0, 2), at(2, 0))).toEqual([at(0, 2), at(1, 1), at(2, 0)])
  })
})
