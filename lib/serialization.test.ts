import { describe, it, expect } from 'vitest'
import { serializeDrawing, deserializeDrawing, compressColor, decompressColor } from './serialization'
import type { DrawingData } from '@/lib/types'

function drawing(overrides: Partial<DrawingData> = {}): DrawingData {
  return {
    pattern: 'squares',
    pixelSize: 15,
    canvasWidth: 20,
    canvasHeight: 20,
    colors: {},
    layers: [{ id: 'l1', name: 'Layer 1', visible: true, grid: {} }],
    activeLayerIndex: 0,
    ...overrides,
  }
}

describe('serializeDrawing / deserializeDrawing (v2, layer-aware)', () => {
  it('roundtrips a single layer with a few pixels', () => {
    const data = drawing({
      colors: { '0': '#000000', '1': '#ff0000' },
      layers: [{
        id: 'l1',
        name: 'Layer 1',
        visible: true,
        grid: { '0,0': '#000000', '1,1': '#ff0000', '2,2': '#00ff00' },
      }],
    })

    const serialized = serializeDrawing(data)
    expect(serialized.startsWith('v2|s|15|20|20|0|')).toBe(true)

    const result = deserializeDrawing(serialized)
    expect(result).not.toBeNull()
    expect(result?.pattern).toBe('squares')
    expect(result?.colors).toEqual(data.colors)
    expect(result?.layers).toHaveLength(1)
    expect(result?.layers[0].name).toBe('Layer 1')
    expect(result?.layers[0].visible).toBe(true)
    expect(result?.layers[0].grid).toEqual(data.layers[0].grid)
    expect(result?.activeLayerIndex).toBe(0)
  })

  it('roundtrips multiple layers, preserving order, names, visibility and per-layer grids', () => {
    const data = drawing({
      activeLayerIndex: 1,
      layers: [
        { id: 'l1', name: 'Background', visible: true, grid: { '0,0': '#ffffff' } },
        { id: 'l2', name: 'Line Art', visible: false, grid: { '0,0': '#000000', '1,1': '#000000' } },
      ],
    })

    const serialized = serializeDrawing(data)
    const result = deserializeDrawing(serialized)

    expect(result?.layers).toHaveLength(2)
    expect(result?.layers[0]).toMatchObject({ name: 'Background', visible: true, grid: { '0,0': '#ffffff' } })
    expect(result?.layers[1]).toMatchObject({ name: 'Line Art', visible: false, grid: { '0,0': '#000000', '1,1': '#000000' } })
    expect(result?.activeLayerIndex).toBe(1)
  })

  it('preserves an explicitly-painted white pixel as distinct from a transparent one', () => {
    const data = drawing({
      layers: [{ id: 'l1', name: 'Layer 1', visible: true, grid: { '0,0': '#ffffff' } }],
    })

    const serialized = serializeDrawing(data)
    const result = deserializeDrawing(serialized)

    expect(result?.layers[0].grid).toEqual({ '0,0': '#ffffff' })
  })

  it('dedupes colors shared across layers', () => {
    const data = drawing({
      layers: [
        { id: 'l1', name: 'A', visible: true, grid: { '0,0': '#ff0000' } },
        { id: 'l2', name: 'B', visible: true, grid: { '0,1': '#ff0000' } },
      ],
    })

    const serialized = serializeDrawing(data)
    // allColors segment (part index 7) should contain the color exactly once
    const parts = serialized.split('|')
    expect(parts[7].split(',').filter(Boolean)).toEqual(['ff0000'])
  })

  it('handles a layer name containing the "|" separator', () => {
    const data = drawing({
      layers: [{ id: 'l1', name: 'A|B', visible: true, grid: { '0,0': '#000000' } }],
    })

    const serialized = serializeDrawing(data)
    const result = deserializeDrawing(serialized)

    expect(result?.layers[0].name).toBe('A|B')
    expect(result?.layers[0].grid).toEqual({ '0,0': '#000000' })
  })

  it('handles all pattern types in roundtrip', () => {
    const patterns: Array<'squares' | 'bricks' | 'bricksVertical'> = ['squares', 'bricks', 'bricksVertical']

    patterns.forEach((pattern) => {
      const data = drawing({
        pattern,
        pixelSize: 20,
        canvasWidth: 32,
        canvasHeight: 32,
        layers: [{ id: 'l1', name: 'Layer 1', visible: true, grid: { '10,10': '#ff0000' } }],
      })

      const result = deserializeDrawing(serializeDrawing(data))
      expect(result?.pattern).toBe(pattern)
    })
  })

  it('returns null for invalid format (too few parts)', () => {
    expect(deserializeDrawing('s|15|20|20')).toBeNull()
  })
})

describe('deserializeDrawing backward compatibility (legacy v1 single-grid format)', () => {
  it('migrates an old single-grid string into one layer', () => {
    const compact = 's|15|20|20|0,ff0000|0,ff0000|0,0:0;1,1:1'
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result?.pattern).toBe('squares')
    expect(result?.colors).toEqual({ '0': '#000000', '1': '#ff0000' })
    expect(result?.layers).toHaveLength(1)
    expect(result?.layers[0].visible).toBe(true)
    expect(result?.layers[0].grid).toEqual({ '0,0': '#000000', '1,1': '#ff0000' })
    expect(result?.activeLayerIndex).toBe(0)
  })

  it('migrates bricks/bricksVertical legacy strings', () => {
    expect(deserializeDrawing('b|20|32|32|ff00|ff00|5,10:0')?.pattern).toBe('bricks')
    expect(deserializeDrawing('v|25|10|10|||')?.pattern).toBe('bricksVertical')
  })

  it('handles empty legacy colors and grid', () => {
    const result = deserializeDrawing('s|15|20|20|||')
    expect(result?.colors).toEqual({})
    expect(result?.layers[0].grid).toEqual({})
  })

  it('uses default values for invalid numbers', () => {
    const result = deserializeDrawing('s|abc|xyz|invalid|#000000|0|0,0:0')
    expect(result?.pixelSize).toBe(15)
    expect(result?.canvasWidth).toBe(20)
    expect(result?.canvasHeight).toBe(20)
  })
})

describe('compressColor', () => {
  it('should compress a color string to a number', () => {
    expect(compressColor('#000000')).toBe('0')
  })

  it('should compress different color string to a number', () => {
    expect(compressColor('#3a6ea5')).toBe('3a6ea5')
  })
})

describe('decompressColor', () => {
  it('should decompress a color number to a string', () => {
    expect(decompressColor('0')).toBe('#000000')
  })

  it('should decompress a different color number to a string', () => {
    expect(decompressColor('3a6ea5')).toBe('#3a6ea5')
  })
})
