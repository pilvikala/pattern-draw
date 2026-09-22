import { TRANSPARENT } from './types'
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

export function getCellColor(grid: { [key: string]: string }, key: string): string {
  return grid[key] || TRANSPARENT
}

// Migrates a pre-layers flat grid (the old single-grid drawing format) into
// a one-layer stack, so old saves/shares/localStorage load unchanged.
export function migrateGridToLayers(grid: { [key: string]: string } | undefined): Layer[] {
  return [createLayer('Layer 1', grid ? { ...grid } : {})]
}

export function clampActiveLayerIndex(index: number, layerCount: number): number {
  if (layerCount <= 0) return 0
  return Math.max(0, Math.min(index, layerCount - 1))
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
// hanging or crashing the tab.
const MIN_CANVAS_DIMENSION = 2
const MAX_CANVAS_DIMENSION = 500

function normalizeCanvasDimension(value: unknown, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.max(MIN_CANVAS_DIMENSION, Math.min(MAX_CANVAS_DIMENSION, num))
}

// Normalizes any raw drawing payload - current-format (with `layers`),
// pre-layers format (with a flat `grid`), or a partially-malformed object
// from localStorage/an old shared link - into a valid DrawingData.
export function normalizeDrawingData(raw: unknown): DrawingData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const pattern = normalizePattern(data.pattern)
  const pixelSize = typeof data.pixelSize === 'number' ? data.pixelSize : 15
  const canvasWidth = normalizeCanvasDimension(data.canvasWidth, 20)
  const canvasHeight = normalizeCanvasDimension(data.canvasHeight, 20)
  const colors = (data.colors as { [key: string]: string }) || {}

  let layers: Layer[]
  if (Array.isArray(data.layers) && data.layers.length > 0) {
    layers = (data.layers as Partial<Layer>[]).map((layer) => ({
      id: layer.id || createLayerId(),
      name: layer.name || 'Layer',
      visible: layer.visible !== false,
      grid: layer.grid || {},
    }))
  } else {
    layers = migrateGridToLayers(data.grid as { [key: string]: string } | undefined)
  }

  const activeLayerIndex = clampActiveLayerIndex(
    typeof data.activeLayerIndex === 'number' ? data.activeLayerIndex : 0,
    layers.length
  )

  return { pattern, pixelSize, canvasWidth, canvasHeight, colors, layers, activeLayerIndex }
}
