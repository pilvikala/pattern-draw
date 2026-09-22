import type { DrawingData, Layer, MatrixPattern } from '@/lib/types'
import { createLayer, createLayerId, migrateGridToLayers, normalizeDrawingData, clampActiveLayerIndex } from '@/lib/layers'

/**
 * Serializes drawing data into a compact string format.
 *
 * Current format (v2), layer-aware:
 *   v2|pattern|pixelSize|width|height|activeLayerIndex|savedColors|allColors|layer1Name|layer1Visible|layer1Grid|layer2Name|...
 * - pattern: 's'=squares, 'b'=bricks, 'v'=bricksVertical
 * - savedColors/allColors: comma-separated compressed hex values (colors are
 *   deduped/shared across all layers)
 * - each layer contributes 3 '|'-separated fields: URI-encoded name (so a
 *   name can't collide with the '|' separator), '1'/'0' visibility, and its
 *   grid entries ("row,col:colorIndex" joined by ';', only non-transparent cells)
 *
 * Legacy format (v1, no leading "v2"): pattern|pixelSize|width|height|colors|grid
 * - a single flat grid, with no concept of layers or transparency (unset
 *   cells rendered as white). Still parsed by deserializeDrawing and
 *   migrated into a single layer for backward compatibility with old
 *   saves/shares.
 */
export function serializeDrawing(data: DrawingData): string {
  const patternChar = data.pattern === 'squares' ? 's' : data.pattern === 'bricks' ? 'b' : 'v'

  const savedColorsArray = Object.entries(data.colors).map(([, color]) => compressColor(color))

  // Colors are deduped/shared across all layers rather than per-layer, so a
  // palette color reused on several layers only costs one index.
  const colorFrequency: Record<string, number> = {}
  for (const layer of data.layers) {
    for (const key in layer.grid) {
      const color = layer.grid[key]
      if (!color) continue
      const compressed = compressColor(color)
      colorFrequency[compressed] = (colorFrequency[compressed] || 0) + 1
    }
  }
  const allColorsArraySorted = Object.keys(colorFrequency).sort((a, b) => colorFrequency[b] - colorFrequency[a])

  const layerFields: string[] = []
  for (const layer of data.layers) {
    const gridEntries: string[] = []
    for (const key in layer.grid) {
      const color = layer.grid[key]
      if (!color) continue
      gridEntries.push(`${key}:${allColorsArraySorted.indexOf(compressColor(color))}`)
    }
    layerFields.push(encodeURIComponent(layer.name), layer.visible ? '1' : '0', gridEntries.join(';'))
  }

  const compact = [
    'v2',
    patternChar,
    data.pixelSize,
    data.canvasWidth,
    data.canvasHeight,
    data.activeLayerIndex,
    savedColorsArray.join(','),
    allColorsArraySorted.join(','),
    ...layerFields,
  ].join('|')

  return compact
}

/**
 * Deserializes compact string format back into DrawingData. Detects and
 * parses both the current layer-aware (v2) format and the legacy (v1)
 * single-grid format.
 */
export function deserializeDrawing(compact: string): DrawingData | null {
  try {
    const parts = compact.split('|')
    if (parts.length < 6) return null

    if (parts[0] === 'v2') {
      return deserializeV2(parts)
    }

    return deserializeV1(parts)
  } catch (e) {
    console.error('Failed to deserialize', e)
    return null
  }
}

function deserializeV1(parts: string[]): DrawingData | null {
  const patternChar = parts[0]
  const pattern: MatrixPattern =
    patternChar === 's' ? 'squares' :
    patternChar === 'b' ? 'bricks' : 'bricksVertical'

  const pixelSize = parseInt(parts[1]) || 15
  const canvasWidth = parseInt(parts[2]) || 20
  const canvasHeight = parseInt(parts[3]) || 20

  const savedColorsArray = parts[4] ? parts[4].split(',').filter(Boolean) : []
  const colors = savedColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const allColorsArray = parts[5] ? parts[5].split(',').filter(Boolean) : []
  const allColors = allColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const grid: { [key: string]: string } = {}
  if (parts[6]) {
    parts[6].split(';').forEach((entry) => {
      const [key, color] = entry.split(':')
      if (key && color) {
        grid[key] = allColors[color]
      }
    })
  }

  return {
    pattern,
    pixelSize,
    canvasWidth,
    canvasHeight,
    colors,
    layers: migrateGridToLayers(grid),
    activeLayerIndex: 0,
  }
}

function deserializeV2(parts: string[]): DrawingData | null {
  const patternChar = parts[1]
  const pattern: MatrixPattern =
    patternChar === 's' ? 'squares' :
    patternChar === 'b' ? 'bricks' : 'bricksVertical'

  const pixelSize = parseInt(parts[2]) || 15
  const canvasWidth = parseInt(parts[3]) || 20
  const canvasHeight = parseInt(parts[4]) || 20
  const activeLayerIndexRaw = parseInt(parts[5]) || 0

  const savedColorsArray = parts[6] ? parts[6].split(',').filter(Boolean) : []
  const colors = savedColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const allColorsArray = parts[7] ? parts[7].split(',').filter(Boolean) : []
  const allColors = allColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const layerFields = parts.slice(8)
  const layers: Layer[] = []
  for (let i = 0; i + 2 < layerFields.length; i += 3) {
    const name = decodeURIComponent(layerFields[i] || 'Layer')
    const visible = layerFields[i + 1] !== '0'
    const gridStr = layerFields[i + 2] || ''
    const grid: { [key: string]: string } = {}
    if (gridStr) {
      gridStr.split(';').forEach((entry) => {
        const [key, colorIdx] = entry.split(':')
        if (key && colorIdx !== undefined) grid[key] = allColors[colorIdx]
      })
    }
    layers.push({ id: createLayerId(), name, visible, grid })
  }
  if (layers.length === 0) {
    layers.push(createLayer('Layer 1'))
  }

  return {
    pattern,
    pixelSize,
    canvasWidth,
    canvasHeight,
    colors,
    layers,
    activeLayerIndex: clampActiveLayerIndex(activeLayerIndexRaw, layers.length),
  }
}

/**
 * Encodes drawing data for URL sharing with optional compression
 */
export async function encodeDrawing(data: DrawingData): Promise<string> {
  const compact = serializeDrawing(data)

  // Try compression if available (modern browsers)
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new CompressionStream('gzip')
      const writer = stream.writable.getWriter()
      const encoder = new TextEncoder()
      writer.write(encoder.encode(compact))
      writer.close()

      const compressed = await new Response(stream.readable).arrayBuffer()
      // Convert to base64url (URL-safe)
      return btoa(String.fromCharCode(...new Uint8Array(compressed)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    } catch (e) {
      // Fallback to uncompressed
    }
  }

  // Fallback: just base64 encode with URL-safe characters
  return btoa(compact)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Decodes drawing data from URL parameter
 * Supports both compressed and uncompressed formats
 * Also supports legacy JSON format for backward compatibility
 */
export async function decodeDrawing(encoded: string): Promise<DrawingData | null> {
  try {
    // Restore base64url to base64
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - base64.length % 4) % 4)
    const base64Padded = base64 + padding

    let decoded: string = ''

    try {
      // Try decompression
      if (typeof DecompressionStream !== 'undefined') {
        const binaryString = atob(base64Padded)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        const stream = new DecompressionStream('gzip')
        const writer = stream.writable.getWriter()
        writer.write(bytes)
        writer.close()

        const decompressed = await new Response(stream.readable).arrayBuffer()
        decoded = new TextDecoder().decode(decompressed)
      } else {
        decoded = atob(base64Padded)
      }
    } catch (e) {
      // Not compressed, decode as base64
      decoded = atob(base64Padded)
    }

    // Try compact format first
    const compactData = deserializeDrawing(decoded)
    if (compactData) {
      return compactData
    }

    // Fallback to old JSON format (pre-dates the compact format entirely)
    try {
      const jsonStr = decodeURIComponent(decoded)
      const data = JSON.parse(jsonStr)
      return normalizeDrawingData(data)
    } catch (e2) {
      console.error('Failed to parse as JSON', e2)
      return null
    }
  } catch (e) {
    console.error('Failed to decode drawing', e)
    return null
  }
}

export function compressColor(color: string): string {
  const num = parseInt(color.replace('#', ''), 16)
  return num.toString(16)
}

export function decompressColor(compressedColor: string): string {
  const num = parseInt(compressedColor, 16)
  return `#${num.toString(16).padStart(6, '0')}`
}
