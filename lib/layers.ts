import type { DrawingData, Layer, MatrixPattern } from './types'

let layerIdCounter = 0
export function createLayerId(): string {
  layerIdCounter += 1
  return `layer-${Date.now()}-${layerIdCounter}`
}

export function createLayer(name: string, grid: { [key: string]: string } = {}): Layer {
  return { id: createLayerId(), name, visible: true, grid }
}

export function createDefaultLayers(): Layer[] {
  return [createLayer('Layer 1')]
}

// Composites visible layers bottom-to-top into a single flat grid, e.g. for
// rendering the canvas or flattening a multi-layer drawing on export. A
// layer's transparent (absent) cells let whatever is beneath show through;
// hidden layers are skipped entirely, matching what's visually on screen.
export function compositeLayers(layers: Layer[]): { [key: string]: string } {
  const result: { [key: string]: string } = {}
  for (const layer of layers) {
    if (!layer.visible) continue
    for (const key in layer.grid) {
      const color = layer.grid[key]
      if (color) result[key] = color
    }
  }
  return result
}

// Migrates a pre-layers flat grid (the old single-grid drawing format) into
// a one-layer stack, so old saves/shares/localStorage load unchanged.
export function migrateGridToLayers(grid: { [key: string]: string } | undefined): Layer[] {
  return [createLayer('Layer 1', grid ? { ...grid } : {})]
}

export function clampActiveLayerIndex(index: number, layerCount: number): number {
  if (layerCount <= 0) return 0
  // Normalize before clamping - a non-integer index (e.g. `activeLayerIndex:
  // 1.5` from malformed localStorage/API data) would otherwise survive the
  // clamp unchanged, and layers[fractionalIndex] is always undefined:
  // updateActiveLayerGrid then silently finds no target layer to paint on.
  // Only NaN needs an explicit fallback - Math.trunc(Infinity) is still
  // Infinity, so +/-Infinity clamp naturally via min/max below, the same as
  // any other out-of-range value.
  const safeIndex = Number.isNaN(index) ? 0 : Math.trunc(index)
  return Math.max(0, Math.min(safeIndex, layerCount - 1))
}

// Merges the layer with `sourceId` into the layer directly below it. The
// merged layer is always left visible: merging only ever starts from a
// visible source (see the early return below, which mirrors the UI's own
// merge-down availability rule), so spreading the *target*'s own `visible`
// into the result would silently hide content that was on-screen a moment
// before the merge whenever the target underneath happened to be hidden.
// Returns `layers` unchanged if the merge isn't valid (no id match, already
// the bottom layer, or the source itself is hidden).
export function mergeLayerDown(layers: Layer[], sourceId: string): Layer[] {
  const index = layers.findIndex((l) => l.id === sourceId)
  if (index <= 0) return layers
  const source = layers[index]
  if (!source.visible) return layers
  const target = layers[index - 1]

  const mergedGrid = { ...target.grid }
  for (const key in source.grid) {
    const color = source.grid[key]
    if (color) mergedGrid[key] = color
  }

  return layers
    .filter((_, i) => i !== index)
    .map((l) => (l.id === target.id ? { ...target, grid: mergedGrid, visible: true } : l))
}

const VALID_PATTERNS: MatrixPattern[] = ['squares', 'bricks', 'bricksVertical']

// Validates against the three known literals rather than casting - an
// unrecognized value (malformed localStorage, a hand-edited shared link)
// would otherwise silently corrupt serializeDrawing's pattern encoding,
// which treats anything that isn't exactly 'squares' or 'bricks' as
// 'bricksVertical'.
function normalizePattern(value: unknown): MatrixPattern {
  return VALID_PATTERNS.includes(value as MatrixPattern) ? (value as MatrixPattern) : 'squares'
}

// Matches the bounds the canvas-size form itself enforces (see
// handleSetCanvasSize in app/page.tsx). A drawing loaded from a shared link
// or localStorage bypasses that form entirely, so without clamping here a
// crafted/corrupted payload with e.g. canvasWidth: 1_000_000 would make
// DrawingCanvas try to render that many grid cells as real DOM elements,
// hanging or crashing the tab. Exported so lib/serialization.ts can apply
// the same cap while parsing the compact `?drawing=` format, rather than
// only after this function has already built every layer/grid from it.
export const MIN_CANVAS_DIMENSION = 2
export const MAX_CANVAS_DIMENSION = 500

function normalizeCanvasDimension(value: unknown, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.max(MIN_CANVAS_DIMENSION, Math.min(MAX_CANVAS_DIMENSION, num))
}

// Matches the pixel-size slider's own range (see Controls.tsx / MobileMenu.tsx,
// min="10" max="50"). Unbounded, a crafted payload could produce an invalid
// or negative CSS grid track size, or (at the high end) blow up the
// rendered/downloaded canvas's pixel dimensions independently of the
// (already-capped) cell count.
const MIN_PIXEL_SIZE = 10
const MAX_PIXEL_SIZE = 50

function normalizePixelSize(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 15
  return Math.max(MIN_PIXEL_SIZE, Math.min(MAX_PIXEL_SIZE, num))
}

// A crafted payload (shared link, tampered localStorage) with an extreme
// layer count would make compositeLayers and the layers panel iterate/render
// that many entries on every paint - capped for the same DoS reasons as the
// canvas dimensions above. Exported for the same reason as the dimension
// bounds - so serialization.ts can stop parsing once it's hit, rather than
// building every layer first and only capping the result afterward.
export const MAX_LAYERS = 50

// Keeps only grid entries that are well-formed ("row,col" keys with a
// non-empty string color) AND fall inside the canvas - without this, a
// crafted payload could declare a small canvas but still smuggle millions
// of "99999,99999"-style entries into a layer's grid, which compositeLayers,
// serializeDrawing, and every localStorage save would go on retaining and
// iterating forever even though none of them are ever visible. Bounding to
// valid in-canvas coordinates also caps each layer at canvasWidth *
// canvasHeight entries, since out-of-range and malformed keys are dropped.
const GRID_KEY_PATTERN = /^(-?\d+),(-?\d+)$/

// Shared by normalizeLayerGrid and normalizeColors below: an accepted-entry
// counter alone can't bound a for...in scan when the payload is crafted
// entirely (or mostly) out of entries that never get accepted (malformed/
// out-of-bounds grid keys, non-string/empty color values) - that counter
// never reaches its cap, so for...in still walks every one of potentially
// millions of raw keys regardless of how few (or none) turn out valid. This
// second, independent counter bounds the scan itself. Generous relative to
// any real drawing's needs (canvasWidth*canvasHeight tops out at
// MAX_CANVAS_DIMENSION^2 = 250,000; MAX_SAVED_COLORS is 200) so it only
// ever kicks in for a payload with drastically more raw keys than valid
// entries.
const MAX_RAW_ENTRIES_TO_SCAN = 1_000_000

function normalizeLayerGrid(rawGrid: unknown, canvasWidth: number, canvasHeight: number): { [key: string]: string } {
  const grid: { [key: string]: string } = {}
  if (!rawGrid || typeof rawGrid !== 'object') return grid

  // A crafted payload can carry millions of raw keys regardless of the
  // canvas's real size (e.g. mostly out-of-bounds coordinates) -
  // Object.entries would materialize all of them into an array before any
  // per-entry check below ever runs. for...in visits one at a time instead,
  // so the maxEntries break can actually stop the work early rather than
  // just capping the *result* after the full scan already happened.
  const record = rawGrid as Record<string, unknown>
  const maxEntries = canvasWidth * canvasHeight
  let count = 0
  let scanned = 0
  for (const key in record) {
    if (count >= maxEntries || scanned >= MAX_RAW_ENTRIES_TO_SCAN) break
    scanned++
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const value = record[key]
    if (typeof value !== 'string' || !value) continue
    const match = GRID_KEY_PATTERN.exec(key)
    if (!match) continue
    const row = Number(match[1])
    const col = Number(match[2])
    if (row < 0 || row >= canvasHeight || col < 0 || col >= canvasWidth) continue
    // Store the canonical `${row},${col}` spelling, not the original key -
    // the regex accepts any numeric spelling of the same coordinate (e.g.
    // "00,01" or "0,+1"), but every other lookup in the app (rendering,
    // compositeLayers, selection) always builds keys via that exact
    // template, so a noncanonical key would sit in the grid invisibly:
    // never rendered, never selectable, yet still retained and counted -
    // and several such aliases of one cell would also bypass the "at most
    // canvasWidth * canvasHeight entries" bound that relies on one entry
    // per real, canonically-addressed cell. Counting only *new* canonical
    // keys (not every accepted entry) keeps that bound accurate even when
    // aliases of an already-seen cell appear before the count is reached.
    const canonicalKey = `${row},${col}`
    if (!(canonicalKey in grid)) count++
    grid[canonicalKey] = value
  }
  return grid
}

// A user's saved-color palette realistically never approaches even a few
// dozen entries; capped for the same reason as MAX_LAYERS - ColorPalette
// renders one DOM element per entry, so an unbounded count from a crafted
// payload is a rendering DoS just like an unbounded layer count would be.
const MAX_SAVED_COLORS = 200

// Same "cast without checking" hazard as the pattern/grid fields above: a
// non-string color value here (e.g. `{ colors: { "0": 12345 } }` from
// tampered localStorage or a hand-edited shared link) passes normalization
// unchanged and later crashes serializeDrawing/compressColor, which calls
// .replace() on it assuming a hex string - that's reachable both from the
// share-link encoder and, since the API routes now normalize before
// serializing, from the save routes too.
function normalizeColors(rawColors: unknown): { [key: string]: string } {
  const colors: { [key: string]: string } = {}
  if (!rawColors || typeof rawColors !== 'object') return colors
  const record = rawColors as Record<string, unknown>
  let count = 0
  let scanned = 0
  // for...in (with its own hasOwnProperty check) visits properties one at a
  // time instead of materializing an array of every key/entry up front like
  // Object.entries/Object.keys would - the only way the break below can
  // actually stop a crafted payload with millions of color entries from
  // paying that allocation cost before this cap ever applies. `count` only
  // grows on an *accepted* entry, so a payload crafted entirely out of
  // null/non-string/empty values would never reach MAX_SAVED_COLORS on its
  // own - `scanned` bounds the raw walk itself regardless of how many
  // entries turn out valid, same as normalizeLayerGrid's `scanned`.
  for (const key in record) {
    if (count >= MAX_SAVED_COLORS || scanned >= MAX_RAW_ENTRIES_TO_SCAN) break
    scanned++
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const value = record[key]
    if (typeof value === 'string' && value) {
      colors[key] = value
      count++
    }
  }
  return colors
}

// Normalizes any raw drawing payload - current-format (with `layers`),
// pre-layers format (with a flat `grid`), or a partially-malformed object
// from localStorage/an old shared link - into a valid DrawingData.
export function normalizeDrawingData(raw: unknown): DrawingData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const pattern = normalizePattern(data.pattern)
  const pixelSize = normalizePixelSize(data.pixelSize)
  const canvasWidth = normalizeCanvasDimension(data.canvasWidth, 20)
  const canvasHeight = normalizeCanvasDimension(data.canvasHeight, 20)
  const colors = normalizeColors(data.colors)

  let layers: Layer[]
  if (Array.isArray(data.layers) && data.layers.length > 0) {
    // Duplicate ids (e.g. from hand-edited localStorage or a crafted shared
    // link) would make layer.id no longer uniquely identify a layer -
    // React keys collide, and every id-based lookup (delete, select,
    // rename, merge) would then hit all matching layers at once instead of
    // exactly one, so a collision is replaced with a fresh id here.
    const seenIds = new Set<string>()
    layers = (data.layers as unknown[]).slice(0, MAX_LAYERS).map((raw) => {
      // Array elements are also client/localStorage-controlled JSON and can
      // individually be null/a non-object (e.g. `{ layers: [null, {...}] }`)
      // even when the array itself is well-formed - reading .id/.name/etc
      // off one directly would throw before normalization can produce its
      // documented safe defaults.
      const layer = (raw && typeof raw === 'object' ? raw : {}) as Partial<Layer>
      let id = typeof layer.id === 'string' && layer.id ? layer.id : createLayerId()
      if (seenIds.has(id)) id = createLayerId()
      seenIds.add(id)
      return {
        id,
        name: typeof layer.name === 'string' && layer.name ? layer.name : 'Layer',
        visible: layer.visible !== false,
        grid: normalizeLayerGrid(layer.grid, canvasWidth, canvasHeight),
      }
    })
  } else {
    layers = migrateGridToLayers(normalizeLayerGrid(data.grid, canvasWidth, canvasHeight))
  }

  const activeLayerIndex = clampActiveLayerIndex(
    typeof data.activeLayerIndex === 'number' ? data.activeLayerIndex : 0,
    layers.length
  )

  return { pattern, pixelSize, canvasWidth, canvasHeight, colors, layers, activeLayerIndex }
}

// normalizeDrawingData bounds each layer's grid independently (at most
// canvasWidth * canvasHeight entries, up to MAX_LAYERS layers), but nothing
// bounds the sum across all layers. A save request with many large-but-
// individually-valid layers (worst case: MAX_LAYERS layers each fully
// painted at MAX_CANVAS_DIMENSION^2, 12.5M cells total) would otherwise
// reach serializeDrawing's per-cell entry-string building and color-
// frequency counting in full before the API routes' post-serialization
// MAX_COMPACT_STRING_LENGTH check ever gets a chance to reject it - the
// expensive work already happened. Counting keys is far cheaper than
// serializing (no string building, no sorting), so this preflight can run
// before that work instead of after it.
export const MAX_TOTAL_GRID_ENTRIES = 2_000_000

export function totalGridEntryCount(data: DrawingData): number {
  return data.layers.reduce((sum, layer) => sum + Object.keys(layer.grid).length, 0)
}
