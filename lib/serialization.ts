import type { DrawingData, Layer, MatrixPattern } from '@/lib/types'
import { createLayer, createLayerId, migrateGridToLayers, normalizeDrawingData, clampActiveLayerIndex, MAX_LAYERS, MAX_CANVAS_DIMENSION } from '@/lib/layers'

// A generous sanity bound on grid entries parsed per layer while decoding -
// independent of (and coarser than) normalizeDrawingData's exact per-canvas
// coordinate validation, which runs afterward. Without this, a crafted
// `?drawing=` payload with a huge grid string would still get fully split
// and parsed into a huge object before normalizeDrawingData ever gets a
// chance to bound it - the parsing cost itself needs its own limit. The
// legitimate maximum (a fully painted canvas at the largest allowed size)
// is MAX_CANVAS_DIMENSION^2, so this never rejects a real drawing.
const MAX_GRID_ENTRIES_PER_LAYER = MAX_CANVAS_DIMENSION * MAX_CANVAS_DIMENSION

// Bounds the comma-separated saved-color/all-color lists while parsing, for
// the same reason as MAX_GRID_ENTRIES_PER_LAYER above: the 10MB compact-size
// guard doesn't stop a crafted legacy payload from putting millions of
// entries in a single one of these fields, and normalizeDrawingData's own
// 200-entry cap on saved colors only applies *after* this split/map/reduce
// has already materialized the full array/object. Split's own `limit`
// argument stops early rather than building the whole array first.
// Exported so tests can assert the cap directly - downstream normalization
// (normalizeDrawingData's 200-entry saved-colors cap) would otherwise mask
// whether this parse-time bound actually ran, since both a fixed and an
// unfixed version end up at <=200 once normalized.
export const MAX_COLOR_LIST_ENTRIES = 10_000

export function parseCappedColorList(raw: string | undefined): string[] {
  return raw ? raw.split(',', MAX_COLOR_LIST_ENTRIES).filter(Boolean) : []
}

// Bounds the raw string before any parsing touches it. The per-field caps
// above only kick in once compact.split('|') (and each layer's grid
// .split(';')) has already materialized an array with one element per
// separator in the input - for a maliciously huge string (e.g. millions of
// '|'/';' characters, cheap to produce with a compressed `?drawing=` link
// since gzip handles repetitive input extremely well) that allocation cost
// happens regardless of where the loops stop afterward. Rejecting the
// string outright above this length protects every split() call in
// deserializeDrawing/deserializeV1/deserializeV2 at once. 10M characters is
// already far beyond anything a legitimately-sized drawing needs to encode
// (our own encodeDrawing warns well before 2,000 characters), so this is a
// hard backstop against crafted input, not a realistic ceiling.
//
// Exported so the save API routes can enforce it too: normalizeDrawingData
// bounds each layer's grid *independently* (canvasWidth * canvasHeight
// entries, up to MAX_LAYERS layers), but nothing bounds the *aggregate*
// across all layers combined. A payload with many large-but-individually-
// valid layers can therefore serialize to a string bigger than this limit -
// the save would succeed, but deserializeDrawing would then refuse to ever
// load it back again. The routes check serializeDrawing's actual output
// length against this same constant before persisting, so "saved" and
// "loadable" can't diverge.
export const MAX_COMPACT_STRING_LENGTH = 10_000_000

// Rejects an absurdly long encoded `?drawing=` value before doing any
// base64/decompression work on it at all - a cheap first-pass filter
// independent of the decompression-bomb guard below.
const MAX_ENCODED_LENGTH = 20_000_000

// gzip handles repetitive input extremely well, so a tiny encoded payload
// (well under MAX_ENCODED_LENGTH) can still decompress into an enormous
// string - a classic decompression-bomb. The old code only checked the
// decompressed string's length *after* decodeDrawing had already fully
// buffered it via `new Response(stream.readable).arrayBuffer()`, so that
// buffering itself needs its own bound. This reads the decompression stream
// incrementally and aborts as soon as the byte budget is exceeded, instead
// of materializing the whole (potentially huge) output first. Tied to
// MAX_COMPACT_STRING_LENGTH (same underlying budget: how big a decoded
// payload deserializeDrawing is willing to parse) rather than a second,
// independently-tunable number that could silently drift from it.
const MAX_DECOMPRESSED_BYTES = MAX_COMPACT_STRING_LENGTH

async function readStreamBounded(readable: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.length
      if (total > maxBytes) {
        await reader.cancel('decompressed payload too large')
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

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
  // indexOf would rescan the whole palette per painted cell (O(paintedCells
  // * uniqueColors)) - a Map built once makes each lookup O(1), which
  // matters since this runs synchronously on the share-link and save paths.
  const colorIndexByCompressed = new Map(allColorsArraySorted.map((c, i) => [c, i]))

  const layerFields: string[] = []
  for (const layer of data.layers) {
    const gridEntries: string[] = []
    for (const key in layer.grid) {
      const color = layer.grid[key]
      if (!color) continue
      gridEntries.push(`${key}:${colorIndexByCompressed.get(compressColor(color))}`)
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
  if (compact.length > MAX_COMPACT_STRING_LENGTH) {
    console.error('Compact drawing payload too large, rejecting')
    return null
  }
  try {
    const parts = compact.split('|')
    if (parts.length < 6) return null

    const result = parts[0] === 'v2' ? deserializeV2(parts) : deserializeV1(parts)
    // Always normalized before returning - this function is called directly
    // by more than just decodeDrawing (the saved-drawings list page and the
    // drawing GET route both call it on stored data too), and the per-field
    // caps above only bound layer count and grid-entries-per-layer, not
    // canvasWidth/canvasHeight/pixelSize. Normalizing here once means every
    // caller gets fully bounded data with no risk of a direct caller
    // bypassing the limits normalizeDrawingData enforces.
    return result ? normalizeDrawingData(result) : null
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

  const savedColorsArray = parseCappedColorList(parts[4])
  const colors = savedColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const allColorsArray = parseCappedColorList(parts[5])
  const allColors = allColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const grid: { [key: string]: string } = {}
  if (parts[6]) {
    const entries = parts[6].split(';')
    for (let i = 0; i < entries.length && i < MAX_GRID_ENTRIES_PER_LAYER; i++) {
      const [key, color] = entries[i].split(':')
      if (key && color) {
        grid[key] = allColors[color]
      }
    }
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

  const savedColorsArray = parseCappedColorList(parts[6])
  const colors = savedColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const allColorsArray = parseCappedColorList(parts[7])
  const allColors = allColorsArray.map(decompressColor).reduce((acc, color, idx) => {
    acc[idx.toString()] = color
    return acc
  }, {} as { [key: string]: string })

  const layerFields = parts.slice(8)
  const layers: Layer[] = []
  // Stop once MAX_LAYERS is reached instead of parsing every triple in the
  // payload and only capping the result afterward - see MAX_GRID_ENTRIES_PER_LAYER above.
  for (let i = 0; i + 2 < layerFields.length && layers.length < MAX_LAYERS; i += 3) {
    const name = decodeURIComponent(layerFields[i] || 'Layer')
    const visible = layerFields[i + 1] !== '0'
    const gridStr = layerFields[i + 2] || ''
    const grid: { [key: string]: string } = {}
    if (gridStr) {
      const entries = gridStr.split(';')
      for (let j = 0; j < entries.length && j < MAX_GRID_ENTRIES_PER_LAYER; j++) {
        const [key, colorIdx] = entries[j].split(':')
        if (key && colorIdx !== undefined) grid[key] = allColors[colorIdx]
      }
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
  if (encoded.length > MAX_ENCODED_LENGTH) {
    console.error('Encoded drawing payload too large, rejecting')
    return null
  }
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
        // Not awaited (reading below drives the pipe), but caught - when
        // readStreamBounded cancels the reader early (payload too large),
        // these writes reject as a side effect, and an uncaught rejection
        // on a promise nobody awaits surfaces as an unhandled rejection.
        writer.write(bytes).catch(() => {})
        writer.close().catch(() => {})

        // Read incrementally with a byte budget rather than
        // `new Response(stream.readable).arrayBuffer()`, which would buffer
        // the full decompressed output - unbounded - before anything could
        // check its size. gzip's compression ratio on repetitive input
        // means a small encoded payload can still decompress into far more
        // than MAX_COMPACT_STRING_LENGTH's worth of characters.
        const decompressedBytes = await readStreamBounded(stream.readable, MAX_DECOMPRESSED_BYTES)
        if (!decompressedBytes) {
          console.error('Decompressed drawing payload too large, rejecting')
          return null
        }
        decoded = new TextDecoder().decode(decompressedBytes)
      } else {
        decoded = atob(base64Padded)
      }
    } catch (e) {
      // Not compressed, decode as base64
      decoded = atob(base64Padded)
    }

    // Try compact format first - deserializeDrawing already normalizes its
    // result (see its own comment), so this is bounded regardless of format.
    const compactData = deserializeDrawing(decoded)
    if (compactData) {
      return compactData
    }

    // Fallback to old JSON format (pre-dates the compact format entirely).
    // deserializeDrawing (tried above) already rejects a `decoded` longer
    // than MAX_COMPACT_STRING_LENGTH, but only for the compact format - an
    // encoded value that decodes (via plain atob, no compression) to
    // something over that length still reaches here, and without this
    // check would hand decodeURIComponent/JSON.parse a multi-megabyte
    // string with no bound at all.
    if (decoded.length > MAX_COMPACT_STRING_LENGTH) {
      console.error('Decoded drawing payload too large for the legacy JSON fallback, rejecting')
      return null
    }
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

// Expands 3-digit shorthand hex ("#fff") to its 6-digit form ("#ffffff") by
// duplicating each digit - the correct expansion per the CSS shorthand hex
// spec. Without this, compressColor would parseInt "fff" directly (4095),
// and decompressColor's 6-digit zero-pad would then turn that back into
// "#000fff" - a different color than what was painted, silently corrupting
// any shorthand hex value that reaches serialization (e.g. typed directly
// into the hex text field) on share/reload.
function canonicalizeHexColor(color: string): string {
  const hex = color.replace('#', '')
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  return color
}

export function compressColor(color: string): string {
  const num = parseInt(canonicalizeHexColor(color).replace('#', ''), 16)
  return num.toString(16)
}

export function decompressColor(compressedColor: string): string {
  const num = parseInt(compressedColor, 16)
  return `#${num.toString(16).padStart(6, '0')}`
}
