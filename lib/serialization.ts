import { DrawingData, MatrixPattern } from '@/app/page'

/**
 * Serializes drawing data into a compact string format
 * Format: pattern|pixelSize|width|height|colors|grid
 * - Pattern: 's'=squares, 'b'=bricks, 'v'=bricksVertical
 * - Colors: comma-separated hex values
 * - Grid: semicolon-separated entries (only non-white pixels)
 */
export function serializeDrawing(data: DrawingData): string {
  // Pattern: 's'=squares, 'b'=bricks, 'v'=bricksVertical
  const patternChar = data.pattern === 'squares' ? 's' : data.pattern === 'bricks' ? 'b' : 'v'
  
  // Colors as array (more compact than object)
  const colorsArray = Object.values(data.colors)
  
  // Grid: only store non-white pixels in compact format "row,col:color"
  const gridEntries: string[] = []
  Object.entries(data.grid).forEach(([key, color]) => {
    if (color && color !== '#ffffff' && color !== '#fff') {
      gridEntries.push(`${key}:${color}`)
    }
  })
  
  // Compact format: pattern|pixelSize|width|height|colors|grid
  // Colors: comma-separated hex values
  // Grid: semicolon-separated entries
  const compact = [
    patternChar,
    data.pixelSize,
    data.canvasWidth,
    data.canvasHeight,
    colorsArray.join(','),
    gridEntries.join(';')
  ].join('|')
  
  return compact
}

/**
 * Deserializes compact string format back into DrawingData
 */
export function deserializeDrawing(compact: string): DrawingData | null {
  try {
    const parts = compact.split('|')
    if (parts.length < 6) return null
    
    const patternChar = parts[0]
    const pattern: MatrixPattern = 
      patternChar === 's' ? 'squares' : 
      patternChar === 'b' ? 'bricks' : 'bricksVertical'
    
    const pixelSize = parseInt(parts[1]) || 15
    const canvasWidth = parseInt(parts[2]) || 20
    const canvasHeight = parseInt(parts[3]) || 20
    
    const colorsArray = parts[4] ? parts[4].split(',').filter(Boolean) : []
    const colors = colorsArray.reduce((acc, color, idx) => {
      acc[idx.toString()] = color
      return acc
    }, {} as { [key: string]: string })
    
    const grid: { [key: string]: string } = {}
    if (parts[5]) {
      parts[5].split(';').forEach((entry) => {
        const [key, color] = entry.split(':')
        if (key && color) {
          grid[key] = color
        }
      })
    }
    
    return {
      pattern,
      pixelSize,
      canvasWidth,
      canvasHeight,
      colors,
      grid,
    }
  } catch (e) {
    console.error('Failed to deserialize', e)
    return null
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
    
    // Fallback to old JSON format
    try {
      const jsonStr = decodeURIComponent(decoded)
      const data: DrawingData = JSON.parse(jsonStr)
      return data
    } catch (e2) {
      console.error('Failed to parse as JSON', e2)
      return null
    }
  } catch (e) {
    console.error('Failed to decode drawing', e)
    return null
  }
}

