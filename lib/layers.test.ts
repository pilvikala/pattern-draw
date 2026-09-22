import { describe, it, expect } from 'vitest'
import {
  compositeLayers,
  createLayer,
  migrateGridToLayers,
  normalizeDrawingData,
  clampActiveLayerIndex,
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
