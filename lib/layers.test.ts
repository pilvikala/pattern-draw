import { describe, it, expect } from 'vitest'
import {
  compositeLayers,
  createLayer,
  migrateGridToLayers,
  normalizeDrawingData,
  clampActiveLayerIndex,
  mergeLayerDown,
  totalGridEntryCount,
} from './layers'
import type { Layer } from './types'

describe('compositeLayers', () => {
  it('overlays layers bottom to top, top layer winning on overlap', () => {
    const layers: Layer[] = [
      createLayer('bottom', { '0,0': '#ff0000', '0,1': '#00ff00' }),
      createLayer('top', { '0,0': '#0000ff' }),
    ]

    expect(compositeLayers(layers)).toEqual({
      '0,0': '#0000ff',
      '0,1': '#00ff00',
    })
  })

  it('lets a transparent (absent) cell on the top layer show the layer below', () => {
    const layers: Layer[] = [
      createLayer('bottom', { '0,0': '#ff0000' }),
      createLayer('top', {}),
    ]

    expect(compositeLayers(layers)).toEqual({ '0,0': '#ff0000' })
  })

  it('skips hidden layers entirely', () => {
    const hidden = createLayer('hidden', { '0,0': '#ff0000' })
    hidden.visible = false
    const layers: Layer[] = [hidden, createLayer('visible', { '0,1': '#00ff00' })]

    expect(compositeLayers(layers)).toEqual({ '0,1': '#00ff00' })
  })

  it('returns an empty grid when all layers are empty or hidden', () => {
    const hidden = createLayer('hidden', { '0,0': '#ff0000' })
    hidden.visible = false
    expect(compositeLayers([hidden])).toEqual({})
    expect(compositeLayers([])).toEqual({})
  })
})

describe('migrateGridToLayers', () => {
  it('wraps a legacy flat grid into a single visible layer', () => {
    const grid = { '0,0': '#ff0000' }
    const layers = migrateGridToLayers(grid)

    expect(layers).toHaveLength(1)
    expect(layers[0].visible).toBe(true)
    expect(layers[0].grid).toEqual(grid)
  })

  it('does not mutate the source grid', () => {
    const grid = { '0,0': '#ff0000' }
    const layers = migrateGridToLayers(grid)
    layers[0].grid['1,1'] = '#00ff00'
    expect(grid).toEqual({ '0,0': '#ff0000' })
  })

  it('handles an undefined grid', () => {
    const layers = migrateGridToLayers(undefined)
    expect(layers).toHaveLength(1)
    expect(layers[0].grid).toEqual({})
  })
})

describe('clampActiveLayerIndex', () => {
  it('clamps to the valid range', () => {
    expect(clampActiveLayerIndex(5, 3)).toBe(2)
    expect(clampActiveLayerIndex(-1, 3)).toBe(0)
    expect(clampActiveLayerIndex(1, 3)).toBe(1)
  })

  it('returns 0 for an empty layer list', () => {
    expect(clampActiveLayerIndex(0, 0)).toBe(0)
  })

  it('truncates a fractional index instead of leaving it non-integer', () => {
    // layers[1.5] is always undefined, regardless of how it got clamped -
    // a malformed `activeLayerIndex: 1.5` from localStorage/API data must
    // resolve to a real, usable layer index.
    expect(clampActiveLayerIndex(1.5, 3)).toBe(1)
    expect(clampActiveLayerIndex(2.9, 3)).toBe(2)
  })

  it('falls back to 0 for a non-finite index (NaN/Infinity)', () => {
    expect(clampActiveLayerIndex(NaN, 3)).toBe(0)
    expect(clampActiveLayerIndex(Infinity, 3)).toBe(2)
    expect(clampActiveLayerIndex(-Infinity, 3)).toBe(0)
  })
})

describe('mergeLayerDown', () => {
  it('merges the source layer\'s cells onto the target below it', () => {
    const layers: Layer[] = [
      createLayer('Bottom', { '0,0': '#0000ff' }),
      createLayer('Top', { '1,1': '#ff0000' }),
    ]
    const result = mergeLayerDown(layers, layers[1].id)

    expect(result).toHaveLength(1)
    expect(result[0].grid).toEqual({ '0,0': '#0000ff', '1,1': '#ff0000' })
  })

  it('lets the source overwrite overlapping cells on the target (source is on top)', () => {
    const layers: Layer[] = [
      createLayer('Bottom', { '0,0': '#0000ff' }),
      createLayer('Top', { '0,0': '#ff0000' }),
    ]
    const result = mergeLayerDown(layers, layers[1].id)
    expect(result[0].grid).toEqual({ '0,0': '#ff0000' })
  })

  it('keeps the merged layer visible even when the target underneath was hidden', () => {
    // Regression test: merging a visible layer into a hidden one must not
    // hide the result - the content was on screen a moment before the merge.
    const hiddenTarget = createLayer('Bottom', { '0,0': '#0000ff' })
    hiddenTarget.visible = false
    const visibleSource = createLayer('Top', { '1,1': '#ff0000' })
    const layers: Layer[] = [hiddenTarget, visibleSource]

    const result = mergeLayerDown(layers, visibleSource.id)

    expect(result).toHaveLength(1)
    expect(result[0].visible).toBe(true)
    expect(result[0].grid).toEqual({ '0,0': '#0000ff', '1,1': '#ff0000' })
  })

  it('preserves the target layer\'s id and name', () => {
    const layers: Layer[] = [createLayer('Keep My Name'), createLayer('Discarded Name')]
    const targetId = layers[0].id
    const result = mergeLayerDown(layers, layers[1].id)

    expect(result[0].id).toBe(targetId)
    expect(result[0].name).toBe('Keep My Name')
  })

  it('is a no-op when the source is the bottom-most layer', () => {
    const layers: Layer[] = [createLayer('Only'), createLayer('Second')]
    const result = mergeLayerDown(layers, layers[0].id)
    expect(result).toBe(layers)
  })

  it('is a no-op when the source layer is hidden (matches the UI\'s merge-down gate)', () => {
    const hiddenSource = createLayer('Top')
    hiddenSource.visible = false
    const layers: Layer[] = [createLayer('Bottom'), hiddenSource]
    const result = mergeLayerDown(layers, hiddenSource.id)
    expect(result).toBe(layers)
  })

  it('is a no-op when the id does not match any layer', () => {
    const layers: Layer[] = [createLayer('A'), createLayer('B')]
    const result = mergeLayerDown(layers, 'nonexistent-id')
    expect(result).toBe(layers)
  })

  it('does not mutate the input array or layers', () => {
    const layers: Layer[] = [createLayer('Bottom', { '0,0': '#0000ff' }), createLayer('Top', { '1,1': '#ff0000' })]
    const snapshot = JSON.parse(JSON.stringify(layers))
    mergeLayerDown(layers, layers[1].id)
    expect(layers).toEqual(snapshot)
  })
})

describe('normalizeDrawingData', () => {
  it('passes through current-format data with a layers array', () => {
    const raw = {
      pattern: 'bricks',
      pixelSize: 20,
      canvasWidth: 32,
      canvasHeight: 32,
      colors: { '0': '#ff0000' },
      layers: [{ id: 'a', name: 'Layer 1', visible: true, grid: { '0,0': '#ff0000' } }],
      activeLayerIndex: 0,
    }

    const result = normalizeDrawingData(raw)
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0].grid).toEqual({ '0,0': '#ff0000' })
    expect(result.pattern).toBe('bricks')
  })

  it('migrates legacy data with a flat grid and no layers array', () => {
    const raw = {
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 20,
      canvasHeight: 20,
      colors: {},
      grid: { '0,0': '#ff0000' },
    }

    const result = normalizeDrawingData(raw)
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0].grid).toEqual({ '0,0': '#ff0000' })
    expect(result.activeLayerIndex).toBe(0)
  })

  it('falls back to sane defaults for garbage input', () => {
    const result = normalizeDrawingData(null)
    expect(result.pattern).toBe('squares')
    expect(result.pixelSize).toBe(15)
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0].grid).toEqual({})
  })

  it('does not crash on a null or non-object element inside the layers array', () => {
    // data.layers is client/localStorage-controlled JSON; the array can be
    // well-formed while individual elements are null (e.g. hand-edited
    // localStorage, or `JSON.stringify` round-tripping a sparse array).
    const raw = { layers: [null, { id: 'a', name: 'Real Layer', visible: true, grid: { '0,0': '#ff0000' } }, 'not-an-object', 42] }
    const result = normalizeDrawingData(raw)

    expect(result.layers).toHaveLength(4)
    // The null/non-object entries fall back to a blank, safely-defaulted layer
    expect(result.layers[0].grid).toEqual({})
    expect(typeof result.layers[0].id).toBe('string')
    expect(result.layers[0].name).toBe('Layer')
    // The well-formed entry is preserved
    expect(result.layers[1]).toMatchObject({ name: 'Real Layer', visible: true, grid: { '0,0': '#ff0000' } })
  })

  it('replaces duplicate layer ids with fresh unique ones', () => {
    // Client/localStorage-controlled JSON can carry the same id on two
    // layers (hand-edited, or a bug elsewhere). Without deduplication,
    // React keys collide and every id-based action (delete/select/merge)
    // targets all matching layers instead of exactly one.
    const raw = {
      layers: [
        { id: 'dup', name: 'First', visible: true, grid: { '0,0': '#ff0000' } },
        { id: 'dup', name: 'Second', visible: true, grid: { '1,1': '#00ff00' } },
        { id: 'dup', name: 'Third', visible: true, grid: { '2,2': '#0000ff' } },
      ],
    }

    const result = normalizeDrawingData(raw)
    const ids = result.layers.map((l) => l.id)
    expect(new Set(ids).size).toBe(3)
    // Content stays associated with the right (now-unique) id
    expect(result.layers.find((l) => l.name === 'First')?.grid).toEqual({ '0,0': '#ff0000' })
    expect(result.layers.find((l) => l.name === 'Second')?.grid).toEqual({ '1,1': '#00ff00' })
    expect(result.layers.find((l) => l.name === 'Third')?.grid).toEqual({ '2,2': '#0000ff' })
  })

  it('falls back to squares for an invalid pattern value instead of passing it through', () => {
    const result = normalizeDrawingData({ pattern: 'not-a-real-pattern' })
    expect(result.pattern).toBe('squares')
  })

  it('accepts each valid pattern literal', () => {
    expect(normalizeDrawingData({ pattern: 'squares' }).pattern).toBe('squares')
    expect(normalizeDrawingData({ pattern: 'bricks' }).pattern).toBe('bricks')
    expect(normalizeDrawingData({ pattern: 'bricksVertical' }).pattern).toBe('bricksVertical')
  })

  it('clamps an oversized canvas width/height to the 500 max (denial-of-service guard)', () => {
    const result = normalizeDrawingData({ canvasWidth: 1_000_000, canvasHeight: 999_999 })
    expect(result.canvasWidth).toBe(500)
    expect(result.canvasHeight).toBe(500)
  })

  it('caps an excessive layer count (denial-of-service guard)', () => {
    const manyLayers = Array.from({ length: 500 }, (_, i) => ({
      id: `l${i}`,
      name: `Layer ${i}`,
      visible: true,
      grid: {},
    }))
    const result = normalizeDrawingData({ layers: manyLayers, activeLayerIndex: 499 })
    expect(result.layers.length).toBeLessThanOrEqual(50)
    // activeLayerIndex should still point at a real (capped) layer
    expect(result.activeLayerIndex).toBeLessThan(result.layers.length)
  })

  it('clamps an undersized or non-numeric canvas width/height to the 2 minimum', () => {
    expect(normalizeDrawingData({ canvasWidth: 0, canvasHeight: -5 }).canvasWidth).toBe(2)
    expect(normalizeDrawingData({ canvasWidth: 'huge', canvasHeight: null }).canvasWidth).toBe(20)
  })

  it('clamps pixelSize to the 10-50 slider range', () => {
    expect(normalizeDrawingData({ pixelSize: -100 }).pixelSize).toBe(10)
    expect(normalizeDrawingData({ pixelSize: 999999 }).pixelSize).toBe(50)
    expect(normalizeDrawingData({ pixelSize: 'huge' }).pixelSize).toBe(15)
  })

  it('drops grid cells outside the (clamped) canvas bounds', () => {
    const raw = {
      canvasWidth: 5,
      canvasHeight: 5,
      layers: [{
        id: 'a',
        name: 'Layer 1',
        visible: true,
        grid: {
          '0,0': '#ff0000',
          '4,4': '#00ff00',
          '99999,99999': '#0000ff',
          '-1,0': '#0000ff',
          '2,2': '#000000',
        },
      }],
    }
    const result = normalizeDrawingData(raw)
    expect(result.layers[0].grid).toEqual({ '0,0': '#ff0000', '4,4': '#00ff00', '2,2': '#000000' })
  })

  it('canonicalizes noncanonical numeric key spellings instead of storing them verbatim', () => {
    // The renderer, compositeLayers, and selection code all build lookup
    // keys via the exact `${row},${col}` template - a stored key like
    // "00,01" would pass coordinate validation but never be found by any of
    // them, making the cell permanently invisible while still occupying an
    // entry (and letting several aliases of one cell bypass the intended
    // one-entry-per-cell bound).
    const raw = {
      canvasWidth: 5,
      canvasHeight: 5,
      layers: [{ id: 'a', name: 'Layer 1', visible: true, grid: { '00,01': '#ff0000' } }],
    }
    const result = normalizeDrawingData(raw)
    expect(result.layers[0].grid).toEqual({ '0,1': '#ff0000' })
  })

  it('deduplicates multiple noncanonical aliases of the same cell into one canonical entry', () => {
    const raw = {
      canvasWidth: 5,
      canvasHeight: 5,
      layers: [{
        id: 'a',
        name: 'Layer 1',
        visible: true,
        grid: { '0,1': '#000000', '00,1': '#ff0000', '0,01': '#00ff00' },
      }],
    }
    const result = normalizeDrawingData(raw)
    expect(Object.keys(result.layers[0].grid)).toEqual(['0,1'])
  })

  it('bounds a raw grid with a huge number of entries instead of visiting every one', () => {
    // A crafted payload's grid object can carry far more raw keys than the
    // canvas could ever legitimately hold (e.g. mostly out-of-bounds
    // coordinates) - Object.entries would materialize an array of all of
    // them before any per-entry check runs. This asserts the *result* stays
    // correctly bounded and correct despite the huge input, and (mainly)
    // that this completes quickly rather than hanging - a naive
    // materialize-then-filter implementation would also produce a correct
    // result here, just after doing far more work to get there.
    const hugeGrid: Record<string, string> = {}
    for (let i = 0; i < 500_000; i++) hugeGrid[`${i + 1000},${i + 1000}`] = '#ff0000' // all out of bounds
    hugeGrid['2,2'] = '#00ff00' // the one legitimately in-bounds cell
    const raw = {
      canvasWidth: 5,
      canvasHeight: 5,
      layers: [{ id: 'a', name: 'Layer 1', visible: true, grid: hugeGrid }],
    }
    const result = normalizeDrawingData(raw)
    expect(result.layers[0].grid).toEqual({ '2,2': '#00ff00' })
  })

  it('bounds the raw scan itself when the payload is almost entirely malformed keys', () => {
    // The distinct-canonical-key counter alone never reaches maxEntries
    // when the payload is mostly garbage (no key is ever accepted), so it
    // can't stop for...in from still walking every one of potentially
    // millions of keys - a separate raw-scan cap is needed. This proves
    // that cap is enforced: a valid entry placed after the scan limit is
    // never reached and is silently dropped, which is exactly what a real
    // (very large) crafted payload would also do.
    const hugeGrid: Record<string, string> = {}
    for (let i = 0; i < 1_000_000; i++) hugeGrid[`bad-key-${i}`] = '#ff0000' // never a valid "row,col" key
    hugeGrid['2,2'] = '#00ff00' // valid, but placed after the raw-scan cap
    const raw = {
      canvasWidth: 5,
      canvasHeight: 5,
      layers: [{ id: 'a', name: 'Layer 1', visible: true, grid: hugeGrid }],
    }
    const result = normalizeDrawingData(raw)
    expect(result.layers[0].grid).toEqual({})
  })

  it('drops malformed grid keys and non-string values', () => {
    const raw = {
      canvasWidth: 5,
      canvasHeight: 5,
      layers: [{
        id: 'a',
        name: 'Layer 1',
        visible: true,
        grid: {
          'not-a-key': '#ff0000',
          '1,1': 12345,
          '2,2': '',
          '3,3': '#00ff00',
        },
      }],
    }
    const result = normalizeDrawingData(raw)
    expect(result.layers[0].grid).toEqual({ '3,3': '#00ff00' })
  })

  it('falls back to a string id/name when the raw layer supplies non-strings', () => {
    const raw = {
      layers: [{ id: 42, name: { toString: () => 'evil' }, visible: true, grid: {} }],
    }
    const result = normalizeDrawingData(raw)
    expect(typeof result.layers[0].id).toBe('string')
    expect(result.layers[0].name).toBe('Layer')
  })

  it('drops non-string color values instead of passing them through', () => {
    // serializeDrawing's compressColor calls .replace() on each color value
    // assuming a hex string - a non-string value here would crash it later
    // (in the share-link encoder, or server-side since the save routes now
    // normalize before serializing).
    const result = normalizeDrawingData({ colors: { '0': '#ff0000', '1': 12345, '2': null, '3': '#00ff00' } })
    expect(result.colors).toEqual({ '0': '#ff0000', '3': '#00ff00' })
  })

  it('caps an excessive saved-colors count (rendering DoS guard)', () => {
    const manyColors: Record<string, string> = {}
    for (let i = 0; i < 5000; i++) manyColors[String(i)] = '#ff0000'
    const result = normalizeDrawingData({ colors: manyColors })
    expect(Object.keys(result.colors).length).toBeLessThanOrEqual(200)
  })

  it('stops iterating the raw colors object at the cap instead of visiting every entry first', () => {
    // Object.entries/Object.keys would materialize an array of every
    // property before a break inside the loop ever runs - only for...in
    // (or similar lazy iteration) can actually stop early. A getter-based
    // proxy-like object isn't practical to assert against directly here, so
    // this instead asserts the *result* only ever contains the first
    // MAX_SAVED_COLORS insertion-order entries, which a naive
    // materialize-then-cap implementation would also satisfy - the
    // meaningful guard is exercised via a very large object below without
    // timing out, which a real un-bounded materialization of, say, a
    // million-entry object would still technically survive quickly in
    // Node, so this is primarily a regression/documentation test.
    const manyColors: Record<string, string> = {}
    for (let i = 0; i < 500_000; i++) manyColors[String(i)] = '#00ff00'
    const result = normalizeDrawingData({ colors: manyColors })
    expect(Object.keys(result.colors).length).toBe(200)
    expect(result.colors['0']).toBe('#00ff00')
    expect(result.colors['199']).toBe('#00ff00')
  })

  it('clamps an out-of-range activeLayerIndex', () => {
    const raw = {
      layers: [
        { id: 'a', name: 'Layer 1', visible: true, grid: {} },
        { id: 'b', name: 'Layer 2', visible: true, grid: {} },
      ],
      activeLayerIndex: 99,
    }
    expect(normalizeDrawingData(raw).activeLayerIndex).toBe(1)
  })
})

describe('totalGridEntryCount', () => {
  it('sums painted cell counts across all layers', () => {
    const data = normalizeDrawingData({
      layers: [
        { id: 'a', name: 'Layer 1', visible: true, grid: { '0,0': '#ff0000', '0,1': '#00ff00' } },
        { id: 'b', name: 'Layer 2', visible: true, grid: { '1,0': '#0000ff' } },
      ],
    })
    expect(totalGridEntryCount(data)).toBe(3)
  })

  it('returns 0 for a drawing with no painted cells', () => {
    const data = normalizeDrawingData({ layers: [{ id: 'a', name: 'Layer 1', visible: true, grid: {} }] })
    expect(totalGridEntryCount(data)).toBe(0)
  })
})
