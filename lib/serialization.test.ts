import { describe, it, expect } from 'vitest'
import { serializeDrawing, deserializeDrawing, encodeDrawing, decodeDrawing, compressColor, decompressColor, MAX_COMPACT_STRING_LENGTH } from './serialization'
import { normalizeDrawingData } from './layers'
import type { DrawingData, Layer } from '@/lib/types'

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

describe('decodeDrawing security bounds (compact-format path)', () => {
  it('clamps an oversized canvas width/height smuggled through a ?drawing= link', async () => {
    const malicious = drawing({ canvasWidth: 1_000_000, canvasHeight: 1_000_000 })
    const encoded = await encodeDrawing(malicious)
    const result = await decodeDrawing(encoded)

    expect(result).not.toBeNull()
    expect(result?.canvasWidth).toBeLessThanOrEqual(500)
    expect(result?.canvasHeight).toBeLessThanOrEqual(500)
  })

  it('caps an excessive layer count smuggled through a ?drawing= link', async () => {
    const manyLayers = Array.from({ length: 200 }, (_, i) => ({
      id: `l${i}`,
      name: `Layer ${i}`,
      visible: true,
      grid: {},
    }))
    const malicious = drawing({ layers: manyLayers, activeLayerIndex: 0 })
    const encoded = await encodeDrawing(malicious)
    const result = await decodeDrawing(encoded)

    expect(result).not.toBeNull()
    expect(result!.layers.length).toBeLessThanOrEqual(50)
  })

  it('deserializeDrawing itself stops parsing at the layer cap, not just the normalizeDrawingData wrapper', () => {
    // Exercises deserializeV2's own loop bound directly (sync, no
    // decodeDrawing/normalizeDrawingData involved) - the whole point of the
    // fix is that parsing stops early rather than building every layer
    // first and capping the result afterward.
    const manyLayers = Array.from({ length: 60 }, (_, i) => ({
      id: `l${i}`,
      name: `Layer ${i}`,
      visible: true,
      grid: { '0,0': '#ff0000' },
    }))
    const compact = serializeDrawing(drawing({ layers: manyLayers, activeLayerIndex: 0 }))
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result!.layers.length).toBeLessThanOrEqual(50)
  })

  it('rejects a compact payload longer than the hard size backstop before parsing it', () => {
    // A pathological string that would otherwise force compact.split('|')
    // to materialize millions of elements before any per-field cap runs.
    const huge = 'v2|' + 'x|'.repeat(6_000_000)
    expect(deserializeDrawing(huge)).toBeNull()
  })

  it('deserializeDrawing itself clamps dimensions, not just callers that route through decodeDrawing', () => {
    // The saved-drawings list page and the drawing GET route both call
    // deserializeDrawing directly (not decodeDrawing), so the bound has to
    // live inside deserializeDrawing itself to protect them too.
    const malicious = drawing({ canvasWidth: 1_000_000, canvasHeight: 1_000_000 })
    const compact = serializeDrawing(malicious)
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result!.canvasWidth).toBeLessThanOrEqual(500)
    expect(result!.canvasHeight).toBeLessThanOrEqual(500)
  })
})

describe('aggregate size across layers (save-route guard invariant)', () => {
  it('several individually-valid layers can still serialize past MAX_COMPACT_STRING_LENGTH, and deserializeDrawing correctly refuses to load the result', () => {
    // Each layer alone is well within normalizeDrawingData's per-layer/
    // per-canvas bounds (500x500, well under the 50-layer cap) - normalizing
    // has no *aggregate* bound across layers, which is exactly the gap the
    // save API routes' explicit serialized-length check exists to catch.
    const fullGrid = (): { [key: string]: string } => {
      const grid: { [key: string]: string } = {}
      for (let row = 0; row < 500; row++) {
        for (let col = 0; col < 500; col++) {
          grid[`${row},${col}`] = '#ff0000'
        }
      }
      return grid
    }
    const layers: Layer[] = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      name: `Layer ${i}`,
      visible: true,
      grid: fullGrid(),
    }))

    const data = normalizeDrawingData({
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 500,
      canvasHeight: 500,
      colors: {},
      layers,
      activeLayerIndex: 0,
    })
    // normalizeDrawingData accepted all 5 full layers - no per-layer bound tripped.
    expect(data.layers).toHaveLength(5)
    expect(Object.keys(data.layers[0].grid)).toHaveLength(250_000)

    const serialized = serializeDrawing(data)
    expect(serialized.length).toBeGreaterThan(MAX_COMPACT_STRING_LENGTH)

    // This is exactly what deserializeDrawing does when this drawing is
    // later loaded back - without a save-time guard using this same
    // serialized.length check, a "successfully saved" drawing like this one
    // would be permanently unloadable.
    expect(deserializeDrawing(serialized)).toBeNull()
  }, 20000)
})

describe('decodeDrawing decompression-bomb guard', () => {
  async function gzipBase64Url(text: string): Promise<string> {
    const stream = new CompressionStream('gzip')
    const writer = stream.writable.getWriter()
    writer.write(new TextEncoder().encode(text))
    writer.close()
    const compressed = await new Response(stream.readable).arrayBuffer()
    return btoa(String.fromCharCode(...new Uint8Array(compressed)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  it('rejects a tiny gzip payload that decompresses far past the byte budget', async () => {
    // Highly repetitive text compresses to a few KB but expands to 15MB -
    // exactly the "small encoded, huge decompressed" shape a decompression
    // bomb exploits. Buffering the full output before checking its size
    // (the old behavior) would defeat the point of bounding it at all.
    const bomb = await gzipBase64Url('a'.repeat(15_000_000))
    const result = await decodeDrawing(bomb)
    expect(result).toBeNull()
  })

  it('rejects an absurdly long encoded value before attempting to decode it', async () => {
    const result = await decodeDrawing('x'.repeat(25_000_000))
    expect(result).toBeNull()
  })

  it('still decodes a normal-sized drawing correctly (guard does not affect real use)', async () => {
    const data = drawing({ layers: [{ id: 'l1', name: 'Layer 1', visible: true, grid: { '1,1': '#ff0000' } }] })
    const encoded = await encodeDrawing(data)
    const result = await decodeDrawing(encoded)
    expect(result?.layers[0].grid).toEqual({ '1,1': '#ff0000' })
  })
})
