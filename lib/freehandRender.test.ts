import { describe, it, expect, afterEach, vi } from 'vitest'
import { drawOverlayLayers, drawStroke, splitRenderLayers } from './freehandRender'
import { generateDrawingPreview } from './drawingPreview'
import { createFreehandLayer, createLayer } from './layers'
import type { DrawingData, Stroke } from './types'

// A canvas context that records what is drawn instead of drawing it: just
// enough to check which operations run, and in what order.
function recordingContext() {
  const calls: string[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.map((a) => (typeof a === 'number' ? Math.round(a * 100) / 100 : '')).join(',')})`)
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      if (prop === 'fillStyle' || prop === 'strokeStyle') calls.push(`${prop}=${value}`)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const stroke = (color: string, points: number[], width = 0.5): Stroke => ({ color, width, points })

describe('drawStroke', () => {
  it('draws a single point as a filled dot of the stroke width', () => {
    const { ctx, calls } = recordingContext()
    drawStroke(ctx, stroke('#ff0000', [3, 4], 1))
    expect(calls).toContain('arc(3,4,0.5,0,6.28)')
    expect(calls).toContain('fill()')
  })

  it('draws a line through its points, smoothed with curves', () => {
    const { ctx, calls } = recordingContext()
    drawStroke(ctx, stroke('#00ff00', [0, 0, 1, 1, 2, 0, 3, 1]))
    expect(calls[calls.indexOf('beginPath()') + 1]).toBe('moveTo(0,0)')
    expect(calls.filter((c) => c.startsWith('quadraticCurveTo'))).toHaveLength(2)
    expect(calls).toContain('lineTo(3,1)')
    expect(calls).toContain('stroke()')
  })
})

describe('drawOverlayLayers', () => {
  const options = { pattern: 'squares' as const, pixelSize: 15 }

  it('draws layers bottom to top, so a pixel layer above a freehand layer covers it', () => {
    const { ctx, calls } = recordingContext()
    const pen = createFreehandLayer('Pen', [stroke('#111111', [0, 0, 5, 5])])
    const above = createLayer('Above', { '1,1': '#222222' })
    drawOverlayLayers(ctx, [pen, above], options)
    expect(calls.indexOf('strokeStyle=#111111')).toBeLessThan(calls.indexOf('fillStyle=#222222'))
  })

  it('skips hidden layers', () => {
    const { ctx, calls } = recordingContext()
    drawOverlayLayers(ctx, [{ ...createFreehandLayer('Pen', [stroke('#111111', [0, 0, 5, 5])]), visible: false }], options)
    expect(calls).toEqual([])
  })

  it('paints the live stroke right after its own layer, before the layers above', () => {
    const { ctx, calls } = recordingContext()
    const pen = createFreehandLayer('Pen', [stroke('#111111', [0, 0, 5, 5])])
    const above = createFreehandLayer('Above', [stroke('#333333', [0, 5, 5, 0])])
    drawOverlayLayers(ctx, [pen, above], options, { layerId: pen.id, stroke: stroke('#222222', [1, 1, 2, 2]) })
    const order = ['#111111', '#222222', '#333333'].map((c) => calls.indexOf(`strokeStyle=${c}`))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every((i) => i >= 0)).toBe(true)
  })

  it('offsets cells of shifted rows in the brick pattern', () => {
    const { ctx, calls } = recordingContext()
    drawOverlayLayers(ctx, [createLayer('P', { '1,2': '#222222' })], { pattern: 'bricks', pixelSize: 15, gridLines: false })
    expect(calls).toContain('fillRect(2.5,1,1,1)')
  })
})

describe('generateDrawingPreview (saved-drawings list)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function preview(data: DrawingData) {
    const { ctx, calls } = recordingContext()
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx, toDataURL: () => 'data:image/png;base64,x' }) })
    generateDrawingPreview(data)
    return calls
  }

  const base: DrawingData = { pattern: 'squares', pixelSize: 15, canvasWidth: 4, canvasHeight: 4, colors: {}, layers: [], activeLayerIndex: 0 }

  it('draws freehand strokes over the grid', () => {
    const calls = preview({ ...base, layers: [createLayer('A', { '0,0': '#ff0000' }), createFreehandLayer('Pen', [stroke('#00ff00', [0, 0, 3, 3])])] })
    expect(calls).toContain('lineTo(3,3)')
    // ...after the grid's own cells, not before them.
    expect(calls.indexOf('fillStyle=#ff0000')).toBeLessThan(calls.indexOf('strokeStyle=#00ff00'))
  })

  it('draws nothing extra for a drawing without freehand layers', () => {
    const calls = preview({ ...base, layers: [createLayer('A', { '0,0': '#ff0000' })] })
    expect(calls.some((c) => c.startsWith('lineTo') || c.startsWith('arc'))).toBe(false)
  })
})

describe('splitRenderLayers identity', () => {
  it('returns the same layers array when no overlay is needed, so memoized work is not repeated', () => {
    const layers = [createLayer('A'), createLayer('B')]
    expect(splitRenderLayers(layers).base).toBe(layers)
  })
})
