import type { Layer, MatrixPattern, Stroke } from './types'
import { drawCell } from './cells'

// Splits the layer stack into what the grid itself shows and what has to be
// drawn on top of it as a canvas.
//
// The editor renders pixel layers as one flattened grid of cells, which can't
// have a freehand layer slotted between two of its layers. So everything
// below the lowest visible freehand layer stays in the grid (`base`), and
// that layer plus everything above it (`overlay`) is painted onto a canvas
// over the grid in stack order, which keeps the stacking order exact. With no
// visible freehand layer, `overlay` is empty and rendering is exactly what it
// was before freehand layers existed.
export function splitRenderLayers(layers: Layer[]): { base: Layer[]; overlay: Layer[] } {
  const first = layers.findIndex((layer) => layer.type === 'freehand' && layer.visible)
  if (first === -1) return { base: layers, overlay: [] }
  return { base: layers.slice(0, first), overlay: layers.slice(first) }
}

// Draws one stroke. Expects the context to be scaled so one unit is one grid
// cell, matching the stroke's own coordinates and width.
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { points, width, color } = stroke
  if (points.length < 2) return
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (points.length < 4) {
    ctx.beginPath()
    ctx.arc(points[0], points[1], width / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  ctx.beginPath()
  ctx.moveTo(points[0], points[1])
  const last = points.length / 2 - 1
  // Curves through the midpoints between samples, with the samples as control
  // points, so a hand-drawn line looks smooth instead of faceted.
  for (let k = 1; k < last; k++) {
    const x = points[k * 2], y = points[k * 2 + 1]
    ctx.quadraticCurveTo(x, y, (x + points[k * 2 + 2]) / 2, (y + points[k * 2 + 3]) / 2)
  }
  ctx.lineTo(points[last * 2], points[last * 2 + 1])
  ctx.stroke()
}

export interface OverlayOptions {
  pattern: MatrixPattern
  pixelSize: number
  // Draw the grid lines around painted cells, as the grid's own cells do.
  gridLines?: boolean
}

// Paints layers bottom-to-top onto a context scaled so one unit is one grid
// cell: pixel layers as cells, freehand layers as strokes. `live` is a stroke
// still being drawn, painted right after its layer's committed strokes.
export function drawOverlayLayers(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  { pattern, pixelSize, gridLines = true }: OverlayOptions,
  live?: { layerId: string; stroke: Stroke } | null
): void {
  const lineWidth = 1 / pixelSize
  for (const layer of layers) {
    if (!layer.visible) continue
    if (layer.type === 'freehand') {
      for (const stroke of layer.strokes ?? []) drawStroke(ctx, stroke)
      if (live && live.layerId === layer.id) drawStroke(ctx, live.stroke)
      continue
    }
    if (gridLines) {
      ctx.strokeStyle = '#ddd'
      ctx.lineWidth = lineWidth
    }
    for (const key in layer.grid) {
      const value = layer.grid[key]
      if (!value) continue
      const comma = key.indexOf(',')
      const row = Number(key.slice(0, comma))
      const col = Number(key.slice(comma + 1))
      const x = col + (pattern === 'bricks' && row % 2 === 1 ? 0.5 : 0)
      const y = row + (pattern === 'bricksVertical' && col % 2 === 1 ? 0.5 : 0)
      drawCell(ctx, value, x, y, 1)
      // Inset by half the line so the line sits inside the cell, like the
      // border of a grid cell does.
      if (gridLines) ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, 1 - lineWidth, 1 - lineWidth)
    }
  }
}
