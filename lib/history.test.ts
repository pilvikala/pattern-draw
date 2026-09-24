import { describe, it, expect } from 'vitest'
import { historyEntryCellCost, trimHistoryToBudget, HISTORY_CELL_BUDGET, HISTORY_MAX_ENTRIES } from './history'
import type { HistoryEntry, Layer } from './types'

function layer(overrides: Partial<Layer> = {}): Layer {
  return { id: 'l1', name: 'Layer 1', visible: true, grid: {}, ...overrides }
}

function entry(layers: Layer[], activeLayerIndex = 0): HistoryEntry {
  return { layers, activeLayerIndex }
}

function gridOf(n: number): { [key: string]: string } {
  const grid: { [key: string]: string } = {}
  for (let i = 0; i < n; i++) grid[`${i},0`] = '#000000'
  return grid
}

describe('historyEntryCellCost', () => {
  it('counts painted cells plus one structural unit per layer', () => {
    const e = entry([
      layer({ grid: { '0,0': '#fff', '1,1': '#000' } }),
      layer({ id: 'l2', grid: {} }),
    ])
    // 2 layers (structural) + 2 painted cells + 0 painted cells = 4
    expect(historyEntryCellCost(e)).toBe(4)
  })

  it('charges at least 1 for a layer with an empty grid, not 0', () => {
    const e = entry([layer({ grid: {} })])
    expect(historyEntryCellCost(e)).toBeGreaterThanOrEqual(1)
  })

  it('scales with layer count even when every layer is empty', () => {
    const manyEmptyLayers = Array.from({ length: 50 }, (_, i) => layer({ id: `l${i}`, grid: {} }))
    const e = entry(manyEmptyLayers)
    // Structural cost alone should reflect the layer count, not collapse to 1
    expect(historyEntryCellCost(e)).toBeGreaterThanOrEqual(50)
  })
})

describe('trimHistoryToBudget (small injected budget/maxEntries for fast, deterministic tests)', () => {
  it('keeps everything when total cost is under budget', () => {
    const history: HistoryEntry[] = [
      entry([layer({ grid: gridOf(2) })]),
      entry([layer({ grid: gridOf(3) })]),
    ]
    expect(trimHistoryToBudget(history, 100, 10)).toHaveLength(2)
  })

  it('trims oldest entries first once the summed cost exceeds the budget', () => {
    // Each entry costs 6 (1 structural + 5 painted); a budget of 10 fits at
    // most one such entry alongside the always-kept newest one.
    const history: HistoryEntry[] = [
      entry([layer({ id: 'a', grid: gridOf(5) })]),
      entry([layer({ id: 'b', grid: gridOf(5) })]),
      entry([layer({ id: 'c', grid: gridOf(5) })]),
    ]

    const result = trimHistoryToBudget(history, 10, 10)

    expect(result.length).toBeLessThan(3)
    // The newest entry is always kept
    expect(result[result.length - 1].layers[0].id).toBe('c')
  })

  it('always keeps at least the most recent entry, even alone over budget', () => {
    const history: HistoryEntry[] = [entry([layer({ grid: gridOf(50) })])]

    const result = trimHistoryToBudget(history, 10, 10)

    expect(result).toHaveLength(1)
  })

  it('enforces a hard entry-count ceiling even when every entry is individually cheap', () => {
    // This is the scenario the structural-cost fix targets: many entries,
    // each with several empty layers, that would look "cheap" by painted-
    // cell count alone and could otherwise accumulate unbounded snapshots.
    const history: HistoryEntry[] = Array.from({ length: 60 }, (_, i) =>
      entry([layer({ id: `l${i}-a`, grid: {} }), layer({ id: `l${i}-b`, grid: {} })])
    )

    // Budget huge (never the limiting factor here) - only maxEntries=50 should bind.
    const result = trimHistoryToBudget(history, 1_000_000, 50)

    expect(result.length).toBeLessThanOrEqual(50)
  })

  it('does not mutate the input array', () => {
    const history: HistoryEntry[] = [entry([layer()]), entry([layer({ id: 'l2' })])]
    const original = [...history]
    trimHistoryToBudget(history, 100, 10)
    expect(history).toEqual(original)
  })
})

describe('trimHistoryToBudget with real production defaults (smoke test)', () => {
  it('leaves a normal small session untouched', () => {
    const history: HistoryEntry[] = [
      entry([layer({ grid: gridOf(10) })]),
      entry([layer({ grid: gridOf(20) })]),
      entry([layer({ grid: gridOf(30) })]),
    ]
    expect(trimHistoryToBudget(history)).toHaveLength(3)
  })

  it('exports sane, positive default constants', () => {
    expect(HISTORY_CELL_BUDGET).toBeGreaterThan(0)
    expect(HISTORY_MAX_ENTRIES).toBeGreaterThan(0)
  })
})
