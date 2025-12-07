import { describe, it, expect } from 'vitest'
import { serializeDrawing, deserializeDrawing } from './serialization'
import type { DrawingData } from '@/lib/types'

describe('serializeDrawing', () => {
  it('should serialize a basic drawing with squares pattern', () => {
    const data: DrawingData = {
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 20,
      canvasHeight: 20,
      colors: { '0': '#000000', '1': '#ff0000' },
      grid: {
        '0,0': '#000000',
        '1,1': '#ff0000',
      },
    }

    const result = serializeDrawing(data)
    expect(result).toBe('s|15|20|20|#000000,#ff0000|0,0:#000000;1,1:#ff0000')
  })

  it('should serialize bricks pattern', () => {
    const data: DrawingData = {
      pattern: 'bricks',
      pixelSize: 20,
      canvasWidth: 32,
      canvasHeight: 32,
      colors: { '0': '#00ff00' },
      grid: {
        '5,10': '#00ff00',
      },
    }

    const result = serializeDrawing(data)
    expect(result).toBe('b|20|32|32|#00ff00|5,10:#00ff00')
  })

  it('should serialize bricksVertical pattern', () => {
    const data: DrawingData = {
      pattern: 'bricksVertical',
      pixelSize: 25,
      canvasWidth: 10,
      canvasHeight: 10,
      colors: {},
      grid: {},
    }

    const result = serializeDrawing(data)
    expect(result).toBe('v|25|10|10||')
  })

  it('should exclude white pixels from grid', () => {
    const data: DrawingData = {
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 20,
      canvasHeight: 20,
      colors: {},
      grid: {
        '0,0': '#000000',
        '1,1': '#ffffff',
        '2,2': '#fff',
        '3,3': '#ff0000',
      },
    }

    const result = serializeDrawing(data)
    // Should only include non-white pixels
    expect(result).toContain('0,0:#000000')
    expect(result).toContain('3,3:#ff0000')
    expect(result).not.toContain('1,1')
    expect(result).not.toContain('2,2')
  })

  it('should handle empty colors array', () => {
    const data: DrawingData = {
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 20,
      canvasHeight: 20,
      colors: {},
      grid: {},
    }

    const result = serializeDrawing(data)
    expect(result).toBe('s|15|20|20||')
  })

  it('should handle multiple colors', () => {
    const data: DrawingData = {
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 20,
      canvasHeight: 20,
      colors: {
        '0': '#000000',
        '1': '#ff0000',
        '2': '#00ff00',
        '3': '#0000ff',
      },
      grid: {},
    }

    const result = serializeDrawing(data)
    expect(result).toContain('#000000,#ff0000,#00ff00,#0000ff')
  })
})

describe('deserializeDrawing', () => {
  it('should deserialize a basic drawing', () => {
    const compact = 's|15|20|20|#000000,#ff0000|0,0:#000000;1,1:#ff0000'
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result?.pattern).toBe('squares')
    expect(result?.pixelSize).toBe(15)
    expect(result?.canvasWidth).toBe(20)
    expect(result?.canvasHeight).toBe(20)
    expect(result?.colors).toEqual({
      '0': '#000000',
      '1': '#ff0000',
    })
    expect(result?.grid).toEqual({
      '0,0': '#000000',
      '1,1': '#ff0000',
    })
  })

  it('should deserialize bricks pattern', () => {
    const compact = 'b|20|32|32|#00ff00|5,10:#00ff00'
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result?.pattern).toBe('bricks')
    expect(result?.pixelSize).toBe(20)
    expect(result?.canvasWidth).toBe(32)
    expect(result?.canvasHeight).toBe(32)
  })

  it('should deserialize bricksVertical pattern', () => {
    const compact = 'v|25|10|10||'
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result?.pattern).toBe('bricksVertical')
    expect(result?.pixelSize).toBe(25)
  })

  it('should handle empty colors and grid', () => {
    const compact = 's|15|20|20||'
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result?.colors).toEqual({})
    expect(result?.grid).toEqual({})
  })

  it('should return null for invalid format (too few parts)', () => {
    const compact = 's|15|20|20'
    const result = deserializeDrawing(compact)

    expect(result).toBeNull()
  })

  it('should handle multiple grid entries', () => {
    const compact = 's|15|20|20|#000000|0,0:#000000;5,5:#000000;10,10:#000000'
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result?.grid).toEqual({
      '0,0': '#000000',
      '5,5': '#000000',
      '10,10': '#000000',
    })
  })

  it('should use default values for invalid numbers', () => {
    const compact = 's|abc|xyz|invalid|#000000|0,0:#000000'
    const result = deserializeDrawing(compact)

    expect(result).not.toBeNull()
    expect(result?.pixelSize).toBe(15) // default
    expect(result?.canvasWidth).toBe(20) // default
    expect(result?.canvasHeight).toBe(20) // default
  })
})

describe('serializeDrawing and deserializeDrawing roundtrip', () => {
  it('should serialize and deserialize correctly (roundtrip)', () => {
    const original: DrawingData = {
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 20,
      canvasHeight: 20,
      colors: { '0': '#000000', '1': '#ff0000', '2': '#00ff00' },
      grid: {
        '0,0': '#000000',
        '1,1': '#ff0000',
        '2,2': '#00ff00',
        '5,10': '#0000ff',
      },
    }

    const serialized = serializeDrawing(original)
    const deserialized = deserializeDrawing(serialized)

    expect(deserialized).not.toBeNull()
    expect(deserialized?.pattern).toBe(original.pattern)
    expect(deserialized?.pixelSize).toBe(original.pixelSize)
    expect(deserialized?.canvasWidth).toBe(original.canvasWidth)
    expect(deserialized?.canvasHeight).toBe(original.canvasHeight)
    expect(deserialized?.colors).toEqual(original.colors)
    // Grid should match (white pixels are excluded in serialization)
    expect(deserialized?.grid).toEqual(original.grid)
  })

  it('should handle all pattern types in roundtrip', () => {
    const patterns: Array<'squares' | 'bricks' | 'bricksVertical'> = [
      'squares',
      'bricks',
      'bricksVertical',
    ]

    patterns.forEach((pattern) => {
      const original: DrawingData = {
        pattern,
        pixelSize: 20,
        canvasWidth: 32,
        canvasHeight: 32,
        colors: { '0': '#ff0000' },
        grid: { '10,10': '#ff0000' },
      }

      const serialized = serializeDrawing(original)
      const deserialized = deserializeDrawing(serialized)

      expect(deserialized).not.toBeNull()
      expect(deserialized?.pattern).toBe(pattern)
    })
  })

  it('should handle large grid data', () => {
    const grid: { [key: string]: string } = {}
    for (let i = 0; i < 50; i++) {
      grid[`${i},${i}`] = `#${i.toString(16).padStart(6, '0')}`
    }

    const original: DrawingData = {
      pattern: 'squares',
      pixelSize: 15,
      canvasWidth: 100,
      canvasHeight: 100,
      colors: { '0': '#000000' },
      grid,
    }

    const serialized = serializeDrawing(original)
    const deserialized = deserializeDrawing(serialized)

    expect(deserialized).not.toBeNull()
    expect(Object.keys(deserialized?.grid || {})).toHaveLength(50)
  })
})

