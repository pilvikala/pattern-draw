'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, memo } from 'react'
import type { MatrixPattern, Tool, SelectionRect, Layer, Stroke } from '@/lib/types'
import { normalizeRect, copySelectionCells, clearRectFromGrid, pasteClipboardToGrid } from '@/lib/selection'
import { compositeLayers } from '@/lib/layers'
import { TRANSPARENT } from '@/lib/types'
import { cellBackground, compositeCell, drawCell, paintCell } from '@/lib/cells'
import type { PixelShape } from '@/lib/cells'
import { lineCells, snapLineEnd } from '@/lib/line'
import type { CellPos } from '@/lib/line'
import { drawOverlayLayers, splitRenderLayers } from '@/lib/freehandRender'
import { canvasBounds, moveStrokesInRect, simplifyPoints, quantize, MAX_POINTS_PER_STROKE } from '@/lib/strokes'
import styles from './DrawingCanvas.module.css'

interface PixelProps {
  row: number
  col: number
  // A cell value (see lib/cells.ts) - a color, a half-pixel, or TRANSPARENT.
  color: string
  pixelSize: number
  offsetAxis: 'x' | 'y' | 'none'
  offset: number
}

// Memoized so that painting one cell doesn't re-render every other cell in
// the grid - props are kept to primitives (no inline style objects/closures
// passed in) so React's default shallow comparison actually catches repeats.
const Pixel = memo(function Pixel({ row, col, color, pixelSize, offsetAxis, offset }: PixelProps) {
  return (
    <div
      data-row={row}
      data-col={col}
      className={styles.pixel}
      style={{
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
        // Empty cells and the empty part of a half-pixel show the white "paper".
        background: cellBackground(color, '#ffffff'),
        border: '1px solid #ddd',
        transform: offsetAxis === 'none' ? 'none' : offsetAxis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)`,
      }}
    />
  )
})

// Smallest step (every Nth row/column gets a number) that keeps adjacent
// labels from overlapping at the current pixel size.
const LABEL_STEPS = [1, 2, 5, 10, 20, 50]

// Backing-store pixels per cell for the moving-selection canvases: enough to
// draw half-pixel triangles legibly, while capping the longest side so a
// full 500x500 selection stays a small canvas (see the paint effect below).
const MAX_PREVIEW_CANVAS_SIDE = 2048
const MAX_PREVIEW_CELL_SCALE = 32

// The freehand overlay canvas is drawn at the display's pixel density (and
// the current zoom) so strokes stay sharp, but its backing store is capped for
// the same reason as the selection canvases above: a 500x500 canvas at 50px
// per cell would otherwise ask for a 25,000x25,000px bitmap.
const MAX_OVERLAY_SIDE = 4096
const MAX_OVERLAY_AREA = 16_000_000

// A pointer reports far more positions than a line needs; samples closer
// than this (in cells) to the previous one are skipped while drawing, and the
// finished stroke is thinned further with SIMPLIFY_EPSILON (also in cells).
const MIN_POINT_SPACING = 0.05
const SIMPLIFY_EPSILON = 0.03

// Radius, in cells, of the eraser on a freehand layer: any stroke it touches
// is removed.
const ERASER_RADIUS = 0.5
function getPreviewCellScale(width: number, height: number): number {
  return Math.max(1, Math.min(MAX_PREVIEW_CELL_SCALE, Math.floor(MAX_PREVIEW_CANVAS_SIDE / Math.max(width, height))))
}
function getLabelStep(pixelSize: number, minSpacing: number): number {
  return LABEL_STEPS.find((step) => step * pixelSize >= minSpacing) ?? LABEL_STEPS[LABEL_STEPS.length - 1]
}

interface RulerProps {
  count: number
  pixelSize: number
  step: number
  orientation: 'horizontal' | 'vertical'
  // Which edge of the grid the ruler sits on: top/left or bottom/right.
  side: 'start' | 'end'
}

// Row/column numbers shown alongside the grid. Numbers are 1-based, as
// people count rows when following a pattern, and sit in the same
// pixelSize-wide tracks as the cells so they line up (and zoom) with them.
const Ruler = memo(function Ruler({ count, pixelSize, step, orientation, side }: RulerProps) {
  const isHorizontal = orientation === 'horizontal'
  const rulerClass = [
    isHorizontal ? styles.colRuler : styles.rowRuler,
    side === 'end' ? styles.rulerEnd : '',
  ].join(' ')
  return (
    <div className={rulerClass} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const n = i + 1
        return (
          <span
            key={n}
            className={styles.rulerLabel}
            style={isHorizontal ? { width: `${pixelSize}px` } : { height: `${pixelSize}px` }}
          >
            {n % step === 0 || step === 1 ? n : ''}
          </span>
        )
      })}
    </div>
  )
})

interface DrawingCanvasProps {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  selectedColor: string
  // Thickness, in cells, of the line the pencil draws on a freehand layer.
  strokeWidth: number
  // Which part of a cell the pencil and line tools paint on a pixel layer.
  pixelShape: PixelShape
  // Composited view of the layers the grid itself shows - what's actually
  // rendered as cells. Layers from the lowest visible freehand layer upward
  // are left out and drawn on the overlay canvas instead (see
  // splitRenderLayers).
  grid: { [key: string]: string }
  // Just the active layer's cells - used for the moving-selection preview so
  // it shows only what's actually being relocated, not layers beneath it.
  activeLayerGrid: { [key: string]: string }
  // The full layer stack and the active layer's index - used only to
  // compute the "hole"/floating-preview composites (see the paint effect
  // below), and only while an actual move-drag is happening. Passed raw
  // (rather than pre-composited by the caller) so that composite work
  // only ever runs inside that gated effect: `selection` alone goes
  // non-null as soon as the user starts drawing the initial marquee, well
  // before any move begins, so composites eagerly derived from `selection`
  // changing would still redo this work on every marquee-drag mousemove.
  layers: Layer[]
  activeLayerIndex: number
  // `point` is the pointer position inside the cell, as fractions (0-1) of
  // its size - lets the color picker tell the halves of a half-pixel apart.
  onPixelFill: (key: string, color: string, point?: { x: number; y: number }) => void
  tool: Tool
  selection: SelectionRect | null
  onSelectionChange: (rect: SelectionRect | null) => void
  onSelectionMoveEnd: (deltaRow: number, deltaCol: number) => void
  // A finished pencil stroke on the active freehand layer.
  onStrokeCommit: (stroke: Stroke) => void
  // The eraser passed over (x, y) - in cells from the canvas's top-left
  // corner - on the active freehand layer, with a reach of `radius` cells.
  onStrokeErase: (x: number, y: number, radius: number) => void
  // A finished line on a pixel layer: the "row,col" keys of the cells it covers.
  onLineCommit: (keys: string[]) => void
}

export default function DrawingCanvas({
  pattern,
  pixelSize,
  canvasWidth,
  canvasHeight,
  selectedColor,
  strokeWidth,
  pixelShape,
  grid,
  activeLayerGrid,
  layers,
  activeLayerIndex,
  onPixelFill,
  tool,
  selection,
  onSelectionChange,
  onSelectionMoveEnd,
  onStrokeCommit,
  onStrokeErase,
  onLineCommit,
}: DrawingCanvasProps) {
  const isColorPickerMode = tool === 'colorPicker'
  const isFillMode = tool === 'fill'
  const isSelectMode = tool === 'select'
  const isLineMode = tool === 'line'
  // Fill and color-picker act on a single click rather than drag-painting;
  // select uses its own drag semantics (marquee / move), handled separately.
  const isSingleClickMode = isColorPickerMode || isFillMode
  // On a freehand layer the pencil and eraser work on the pointer's exact
  // position (a smooth line / a reach in cells) instead of on whole cells.
  const activeLayer = layers[activeLayerIndex]
  const activeIsFreehand = activeLayer?.type === 'freehand'
  const isFreehandPointerMode = activeIsFreehand && (tool === 'draw' || tool === 'erase')
  // The hole/floating canvases that preview a dragged selection only know
  // about pixel layers, and sit above everything else - they'd paint over any
  // freehand strokes in or under the selection. So whenever the drawing has an
  // overlay (see splitRenderLayers), and for freehand layers themselves, the
  // drag is previewed by rendering the layers as they will be once dropped.
  const previewDragFromLayers = activeIsFreehand || splitRenderLayers(layers).overlay.length > 0

  const [isDrawing, setIsDrawing] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const selectStartRef = useRef<{ row: number; col: number } | null>(null)
  const [isMovingSelection, setIsMovingSelection] = useState(false)
  const moveStartRef = useRef<{ row: number; col: number } | null>(null)
  const [moveDelta, setMoveDelta] = useState({ dRow: 0, dCol: 0 })
  const movingSnapshotRef = useRef<string[][] | null>(null)
  // The hole (what's left behind) and the floating preview (what's being
  // dragged) are drawn onto <canvas> elements rather than one <div> per
  // cell - at the max 500x500 canvas size, selecting the whole thing would
  // otherwise create 250,000 DOM nodes per overlay on every drag frame.
  const holeCanvasRef = useRef<HTMLCanvasElement>(null)
  const floatingCanvasRef = useRef<HTMLCanvasElement>(null)
  // Freehand layers (and whatever is stacked above them) are painted here, on
  // top of the grid - see paintOverlay below.
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  // The pencil stroke currently being drawn. A ref, not state: it grows on
  // every pointer move, and re-rendering the whole grid for each point would
  // make drawing sluggish on large canvases - the overlay is repainted
  // directly instead.
  const liveStrokeRef = useRef<{ layerId: string; stroke: Stroke } | null>(null)
  // The line tool: a first click sets the start, the second ends the line.
  // On a pixel layer the start is a cell and the preview (`linePreview`, the
  // snapped run of cells) is drawn on its own canvas; on a freehand layer the
  // start is an exact point and the preview is the live stroke, so it is
  // painted in the layer's place in the stack.
  const lineStartCellRef = useRef<CellPos | null>(null)
  const lineStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const lineTouchRef = useRef<{ x: number; y: number } | null>(null)
  const [linePreview, setLinePreview] = useState<CellPos[] | null>(null)
  const [isLineActive, setIsLineActive] = useState(false)
  const linePreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1.0)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomContainerRef = useRef<HTMLDivElement>(null)
  const pinchStartDistanceRef = useRef<number | null>(null)
  const pinchStartZoomRef = useRef<number>(1.0)
  const isPinchingRef = useRef(false)
  const drawStartTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingDrawRef = useRef<{ row: number; col: number; clientX: number; clientY: number } | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const isScrollingRef = useRef(false)

  const dimensions = { cols: canvasWidth, rows: canvasHeight }
  // ~6px per digit at the ruler's font size, plus a sliver of breathing room.
  const colLabelStep = getLabelStep(pixelSize, String(dimensions.cols).length * 6 + 2)
  const rowLabelStep = getLabelStep(pixelSize, 12)

  const getPixelKey = (row: number, col: number): string => {
    return `${row},${col}`
  }

  const getPixelColor = (row: number, col: number): string => {
    const key = getPixelKey(row, col)
    return cellGrid[key] || TRANSPARENT
  }

  const getActiveLayerPixelColor = (row: number, col: number): string => {
    const key = getPixelKey(row, col)
    // Unlike the base canvas (which sits on an opaque white "paper"), the
    // moving-selection preview floats above the already-rendered composite,
    // so an empty active-layer cell must stay see-through here - falling
    // back to white would paint over whatever's on a layer beneath it.
    return activeLayerGrid[key] || TRANSPARENT
  }

  const isInsideSelection = (row: number, col: number): boolean => {
    if (!selection) return false
    return (
      row >= selection.startRow &&
      row <= selection.endRow &&
      col >= selection.startCol &&
      col <= selection.endCol
    )
  }

  const handlePixelClick = useCallback((row: number, col: number, point?: { x: number; y: number }) => {
    const key = getPixelKey(row, col)
    onPixelFill(key, selectedColor, point)
  }, [onPixelFill, selectedColor])

  // Where (clientX, clientY) falls inside the cell at (row, col), as
  // fractions of the cell's size, accounting for zoom, the grid's border and
  // brick offsets. Shared by the mouse and touch paths.
  const getPointInCell = useCallback((clientX: number, clientY: number, row: number, col: number): { x: number; y: number } | undefined => {
    const container = containerRef.current
    if (!container) return undefined
    const rect = container.getBoundingClientRect()
    let x = (clientX - rect.left) / zoom - container.clientLeft
    let y = (clientY - rect.top) / zoom - container.clientTop
    if (pattern === 'bricks' && row % 2 === 1) x -= pixelSize / 2
    if (pattern === 'bricksVertical' && col % 2 === 1) y -= pixelSize / 2
    const clamp = (v: number) => Math.max(0, Math.min(1, v))
    return { x: clamp(x / pixelSize - col), y: clamp(y / pixelSize - row) }
  }, [pattern, pixelSize, zoom])

  // Shared pattern-aware coordinate math used by select-mode dragging.
  const getCellFromPoint = useCallback((clientX: number, clientY: number): { row: number; col: number } | null => {
    if (!containerRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    const x = (clientX - rect.left) / zoom
    const y = (clientY - rect.top) / zoom

    let row: number
    let col: number

    if (pattern === 'bricks') {
      row = Math.floor(y / pixelSize)
      if (row % 2 === 1) {
        const adjustedX = x - pixelSize / 2
        col = Math.floor(adjustedX / pixelSize)
        if (col < 0) col = 0
        if (col >= dimensions.cols) col = dimensions.cols - 1
      } else {
        col = Math.floor(x / pixelSize)
      }
    } else if (pattern === 'bricksVertical') {
      col = Math.floor(x / pixelSize)
      if (col % 2 === 1) {
        const adjustedY = y - pixelSize / 2
        row = Math.floor(adjustedY / pixelSize)
        if (row < 0) row = 0
        if (row >= dimensions.rows) row = dimensions.rows - 1
      } else {
        row = Math.floor(y / pixelSize)
      }
    } else {
      col = Math.floor(x / pixelSize)
      row = Math.floor(y / pixelSize)
    }

    if (col < 0 || col >= dimensions.cols || row < 0 || row >= dimensions.rows) return null
    return { row, col }
  }, [pattern, pixelSize, dimensions, zoom])

  // --- Freehand layers ---

  const strokeBounds = useMemo(() => canvasBounds(pattern, canvasWidth, canvasHeight), [pattern, canvasWidth, canvasHeight])

  // While a selection is being dragged on a freehand layer, the layer is shown
  // as it will be once dropped - the same strokes the drop will produce -
  // instead of the cell-based hole/floating previews pixel layers use.
  const displayLayers = useMemo(() => {
    if (!isMovingSelection || !previewDragFromLayers || !selection) return layers
    if (moveDelta.dRow === 0 && moveDelta.dCol === 0) return layers
    if (activeIsFreehand) {
      const moved = moveStrokesInRect(activeLayer.strokes ?? [], selection, moveDelta.dRow, moveDelta.dCol, strokeBounds)
      return layers.map((layer, i) => (i === activeLayerIndex ? { ...layer, strokes: moved } : layer))
    }
    // The same cell move the drop performs (see handleSelectionMoveEnd).
    const clip = copySelectionCells(activeLayer.grid, selection)
    const cleared = clearRectFromGrid(activeLayer.grid, selection)
    const movedGrid = pasteClipboardToGrid(cleared, clip, selection.startRow + moveDelta.dRow, selection.startCol + moveDelta.dCol, canvasWidth, canvasHeight)
    return layers.map((layer, i) => (i === activeLayerIndex ? { ...layer, grid: movedGrid } : layer))
  }, [isMovingSelection, previewDragFromLayers, activeIsFreehand, selection, moveDelta, layers, activeLayer, activeLayerIndex, strokeBounds, canvasWidth, canvasHeight])

  // The cells the grid shows. Normally the composite the parent computed; while
  // a drag is previewed from layers, a pixel layer below the overlay moves
  // with it, so the cells have to be recomposited from the preview layers.
  const cellGrid = useMemo(
    () => (displayLayers === layers ? grid : compositeLayers(splitRenderLayers(displayLayers).base)),
    [displayLayers, layers, grid]
  )

  const overlayLayers = useMemo(() => splitRenderLayers(displayLayers).overlay, [displayLayers])
  const hasOverlay = overlayLayers.length > 0
  const overlayWidth = (dimensions.cols + (pattern === 'bricks' ? 0.5 : 0)) * pixelSize
  const overlayHeight = (dimensions.rows + (pattern === 'bricksVertical' ? 0.5 : 0)) * pixelSize

  // Sizes an overlay-sized canvas's bitmap (only when it really changed -
  // resizing resets it), clears it, and returns its context scaled so one unit
  // is one grid cell.
  const prepareOverlayContext = useCallback((canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
    const density = (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * Math.max(1, zoom)
    const cap = Math.min(MAX_OVERLAY_SIDE / Math.max(overlayWidth, overlayHeight), Math.sqrt(MAX_OVERLAY_AREA / (overlayWidth * overlayHeight)))
    const ratio = Math.min(density, cap)
    const width = Math.max(1, Math.round(overlayWidth * ratio))
    const height = Math.max(1, Math.round(overlayHeight * ratio))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.setTransform((width / overlayWidth) * pixelSize, 0, 0, (height / overlayHeight) * pixelSize, 0, 0)
    return ctx
  }, [overlayWidth, overlayHeight, pixelSize, zoom])

  // Repaints the whole overlay: every layer from the lowest visible freehand
  // layer up, plus the stroke in progress. Cheap enough to redo per pointer
  // move at the sizes freehand drawing is used at.
  const paintOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const ctx = prepareOverlayContext(canvas)
    if (!ctx) return
    drawOverlayLayers(ctx, overlayLayers, { pattern, pixelSize }, liveStrokeRef.current)
  }, [prepareOverlayContext, overlayLayers, pattern, pixelSize])

  // For clearLine below, which must not change identity with the overlay.
  const paintOverlayRef = useRef(paintOverlay)

  // Layout effect so a stroke that was just committed is painted from its
  // layer in the same frame its live copy is discarded - no flicker.
  useLayoutEffect(() => {
    paintOverlayRef.current = paintOverlay
    paintOverlay()
  }, [paintOverlay, hasOverlay])

  // The line being previewed on a pixel layer, painted the way it will look
  // once committed. Over the cells (and any overlay), not in its layer's place.
  useLayoutEffect(() => {
    const canvas = linePreviewCanvasRef.current
    if (!canvas || !linePreview) return
    const ctx = prepareOverlayContext(canvas)
    if (!ctx) return
    const lineWidth = 1 / pixelSize
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = lineWidth
    for (const { row, col } of linePreview) {
      const value = paintCell(activeLayer?.grid[`${row},${col}`], selectedColor, pixelShape)
      const x = col + (pattern === 'bricks' && row % 2 === 1 ? 0.5 : 0)
      const y = row + (pattern === 'bricksVertical' && col % 2 === 1 ? 0.5 : 0)
      drawCell(ctx, value, x, y, 1)
      ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, 1 - lineWidth, 1 - lineWidth)
    }
  }, [linePreview, prepareOverlayContext, activeLayer, selectedColor, pixelShape, pattern, pixelSize])

  // Where (clientX, clientY) falls on the canvas, in cells from its top-left
  // corner, clamped onto the canvas. Unlike getCellFromPoint this is the
  // exact position, with no snapping to a cell.
  const getCanvasPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = containerRef.current
    if (!container) return null
    const rect = container.getBoundingClientRect()
    const x = ((clientX - rect.left) / zoom - container.clientLeft) / pixelSize
    const y = ((clientY - rect.top) / zoom - container.clientTop) / pixelSize
    return {
      x: Math.max(strokeBounds.x0, Math.min(strokeBounds.x1, x)),
      y: Math.max(strokeBounds.y0, Math.min(strokeBounds.y1, y)),
    }
  }, [zoom, pixelSize, strokeBounds])

  // Ends the stroke in progress, handing the (thinned) result to the parent.
  // Reads only refs, so every pointer handler - including the touch ones that
  // are re-bound as props change - can call it safely.
  const onStrokeCommitRef = useRef(onStrokeCommit)
  useEffect(() => {
    onStrokeCommitRef.current = onStrokeCommit
  }, [onStrokeCommit])

  const finishStroke = useCallback(() => {
    const live = liveStrokeRef.current
    if (!live) return
    liveStrokeRef.current = null
    const points = simplifyPoints(live.stroke.points, SIMPLIFY_EPSILON).map(quantize)
    onStrokeCommitRef.current({ ...live.stroke, points })
  }, [])

  const cancelStroke = useCallback(() => {
    if (!liveStrokeRef.current) return
    liveStrokeRef.current = null
    paintOverlay()
  }, [paintOverlay])

  const beginStroke = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY)
    if (!point || !activeLayer) return
    liveStrokeRef.current = {
      layerId: activeLayer.id,
      stroke: { color: selectedColor, width: strokeWidth, points: [point.x, point.y] },
    }
    paintOverlay()
  }, [getCanvasPoint, activeLayer, selectedColor, strokeWidth, paintOverlay])

  const extendStroke = useCallback((clientX: number, clientY: number) => {
    const live = liveStrokeRef.current
    const point = getCanvasPoint(clientX, clientY)
    if (!live || !point) return
    const points = live.stroke.points
    if (Math.hypot(point.x - points[points.length - 2], point.y - points[points.length - 1]) < MIN_POINT_SPACING) return
    points.push(point.x, point.y)
    if (points.length / 2 >= MAX_POINTS_PER_STROKE) {
      // A stroke can't grow without bound: close this one and carry on from
      // where it ended, which looks like one continuous line.
      const { color, width } = live.stroke
      const layerId = live.layerId
      finishStroke()
      liveStrokeRef.current = { layerId, stroke: { color, width, points: [point.x, point.y] } }
    }
    paintOverlay()
  }, [getCanvasPoint, finishStroke, paintOverlay])

  const eraseAt = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY)
    if (point) onStrokeErase(point.x, point.y, ERASER_RADIUS)
  }, [getCanvasPoint, onStrokeErase])

  // Starts / continues the pencil or eraser at a pointer position.
  const freehandDown = useCallback((clientX: number, clientY: number) => {
    if (tool === 'draw') beginStroke(clientX, clientY)
    else eraseAt(clientX, clientY)
  }, [tool, beginStroke, eraseAt])

  const freehandMove = useCallback((clientX: number, clientY: number) => {
    if (tool === 'draw') extendStroke(clientX, clientY)
    else eraseAt(clientX, clientY)
  }, [tool, extendStroke, eraseAt])

  // --- Line tool ---

  // Drops the line in progress, if any.
  const clearLine = useCallback(() => {
    lineStartCellRef.current = null
    lineTouchRef.current = null
    const hadPoint = lineStartPointRef.current !== null
    lineStartPointRef.current = null
    setLinePreview(null)
    setIsLineActive(false)
    if (hadPoint) {
      liveStrokeRef.current = null
      paintOverlayRef.current()
    }
  }, [])

  // Moves the end of the line in progress to the pointer, snapped to the grid
  // and the 8 directions on a pixel layer, exactly where it is on a freehand one.
  const updateLinePreview = useCallback((clientX: number, clientY: number) => {
    if (activeIsFreehand) {
      const start = lineStartPointRef.current
      const live = liveStrokeRef.current
      const point = getCanvasPoint(clientX, clientY)
      if (!start || !live || !point) return
      live.stroke.color = selectedColor
      live.stroke.width = strokeWidth
      live.stroke.points = [start.x, start.y, point.x, point.y]
      paintOverlay()
      return
    }
    const start = lineStartCellRef.current
    const cell = getCellFromPoint(clientX, clientY)
    if (!start || !cell) return
    const end = snapLineEnd(start, cell, dimensions.rows, dimensions.cols)
    setLinePreview((prev) => {
      const last = prev?.[prev.length - 1]
      return last && last.row === end.row && last.col === end.col ? prev : lineCells(start, end)
    })
  }, [activeIsFreehand, getCanvasPoint, getCellFromPoint, paintOverlay, selectedColor, strokeWidth, dimensions])

  // A click with the line tool: the first sets the start, the second ends the
  // line and commits it. The tool stays selected for the next line.
  const lineClickAt = useCallback((clientX: number, clientY: number) => {
    if (activeIsFreehand) {
      const point = getCanvasPoint(clientX, clientY)
      if (!point || !activeLayer) return
      const start = lineStartPointRef.current
      if (!start) {
        lineStartPointRef.current = point
        setIsLineActive(true)
        liveStrokeRef.current = { layerId: activeLayer.id, stroke: { color: selectedColor, width: strokeWidth, points: [point.x, point.y] } }
        paintOverlay()
        return
      }
      // A second click on the start would only make a dot; wait for a real end.
      if (Math.hypot(point.x - start.x, point.y - start.y) < MIN_POINT_SPACING) return
      lineStartPointRef.current = null
      liveStrokeRef.current = null
      setIsLineActive(false)
      onStrokeCommitRef.current({ color: selectedColor, width: strokeWidth, points: [start.x, start.y, point.x, point.y].map(quantize) })
      paintOverlay()
      return
    }
    const cell = getCellFromPoint(clientX, clientY)
    if (!cell) return
    const start = lineStartCellRef.current
    if (!start) {
      lineStartCellRef.current = cell
      setIsLineActive(true)
      setLinePreview([cell])
      return
    }
    const end = snapLineEnd(start, cell, dimensions.rows, dimensions.cols)
    const keys = lineCells(start, end).map(({ row, col }) => getPixelKey(row, col))
    clearLine()
    onLineCommit(keys)
  }, [activeIsFreehand, activeLayer, getCanvasPoint, getCellFromPoint, selectedColor, strokeWidth, paintOverlay, dimensions, clearLine, onLineCommit])

  // Leaving the tool, or changing what the line was started on, drops it.
  useEffect(() => {
    if (!isLineMode) clearLine()
  }, [isLineMode, clearLine])
  const activeLayerId = activeLayer?.id
  useEffect(() => {
    clearLine()
  }, [activeLayerId, pattern, canvasWidth, canvasHeight, clearLine])

  // Escape cancels the line in progress. Captured, so it doesn't also reach
  // the editor's own Escape handling (which deselects).
  useEffect(() => {
    if (!isLineActive) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      clearLine()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isLineActive, clearLine])

  const handleMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    if (isSelectMode) {
      if (selection && isInsideSelection(row, col)) {
        // When the drag is previewed from the layers themselves (see
        // displayLayers) there is no cell snapshot to take.
        const snapshot: string[][] = []
        for (let r = selection.startRow; !previewDragFromLayers && r <= selection.endRow; r++) {
          const rowColors: string[] = []
          for (let c = selection.startCol; c <= selection.endCol; c++) {
            rowColors.push(getActiveLayerPixelColor(r, c))
          }
          snapshot.push(rowColors)
        }
        movingSnapshotRef.current = snapshot
        moveStartRef.current = { row, col }
        setMoveDelta({ dRow: 0, dCol: 0 })
        setIsMovingSelection(true)
      } else {
        selectStartRef.current = { row, col }
        setIsSelecting(true)
        onSelectionChange(normalizeRect(row, col, row, col))
      }
      return
    }
    if (isLineMode) {
      // Right-click cancels the line in progress; other buttons do nothing.
      if (e.button === 2) clearLine()
      else if (e.button === 0) lineClickAt(e.clientX, e.clientY)
      return
    }
    if (isSingleClickMode) {
      // Only the color picker and fill care where inside the cell the click
      // landed (to tell the halves of a half-pixel apart).
      handlePixelClick(row, col, getPointInCell(e.clientX, e.clientY, row, col))
      return
    }
    setIsDrawing(true)
    if (isFreehandPointerMode) {
      freehandDown(e.clientX, e.clientY)
      return
    }
    handlePixelClick(row, col)
  }

  // Single delegated handler on the grid container instead of one onMouseDown
  // closure per pixel div - keeps Pixel's props free of per-render closures
  // so React.memo can actually skip re-rendering unchanged cells.
  const handleContainerMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const rowAttr = target.dataset.row
    const colAttr = target.dataset.col
    if (rowAttr === undefined || colAttr === undefined) return
    handleMouseDown(e, Number(rowAttr), Number(colAttr))
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isSelectMode) {
      if (!isSelecting && !isMovingSelection) return
      const cell = getCellFromPoint(e.clientX, e.clientY)
      if (!cell) return

      if (isSelecting && selectStartRef.current) {
        onSelectionChange(normalizeRect(selectStartRef.current.row, selectStartRef.current.col, cell.row, cell.col))
      } else if (isMovingSelection && moveStartRef.current && selection) {
        const rawDRow = cell.row - moveStartRef.current.row
        const rawDCol = cell.col - moveStartRef.current.col
        const dRow = Math.max(-selection.startRow, Math.min(dimensions.rows - 1 - selection.endRow, rawDRow))
        const dCol = Math.max(-selection.startCol, Math.min(dimensions.cols - 1 - selection.endCol, rawDCol))
        setMoveDelta({ dRow, dCol })
      }
      return
    }

    if (isLineMode) {
      updateLinePreview(e.clientX, e.clientY)
      return
    }

    if (!isDrawing || !containerRef.current || isSingleClickMode) return

    if (isFreehandPointerMode) {
      freehandMove(e.clientX, e.clientY)
      return
    }

    const cell = getCellFromPoint(e.clientX, e.clientY)
    if (cell) {
      handlePixelClick(cell.row, cell.col)
    }
  }

  const finishSelectInteraction = () => {
    if (isMovingSelection) {
      if (moveDelta.dRow !== 0 || moveDelta.dCol !== 0) {
        onSelectionMoveEnd(moveDelta.dRow, moveDelta.dCol)
      }
      setIsMovingSelection(false)
      moveStartRef.current = null
      movingSnapshotRef.current = null
      setMoveDelta({ dRow: 0, dCol: 0 })
    }
    setIsSelecting(false)
    selectStartRef.current = null
  }

  const handleMouseUp = () => {
    if (isSelectMode) {
      finishSelectInteraction()
      return
    }
    // The live stroke is the line's preview, not a pencil stroke to finish.
    if (isLineMode) return
    finishStroke()
    setIsDrawing(false)
  }

  const handleMouseLeave = () => {
    if (isSelectMode) {
      finishSelectInteraction()
      return
    }
    if (isLineMode) return
    finishStroke()
    setIsDrawing(false)
  }

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Cancel any pending draw if a second touch appears
    if (drawStartTimerRef.current) {
      clearTimeout(drawStartTimerRef.current)
      drawStartTimerRef.current = null
      pendingDrawRef.current = null
    }

    // Check if this is a pinch gesture (2 touches)
    if (e.touches.length === 2) {
      e.preventDefault()
      isPinchingRef.current = true
      // A second finger means a pinch, not a line: drop the stroke in
      // progress rather than committing the stray segment it drew so far.
      // (A line in progress is not a stroke and survives the pinch.)
      if (!isLineMode) cancelStroke()
      setIsDrawing(false)

      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      pinchStartDistanceRef.current = distance
      pinchStartZoomRef.current = zoom
      return
    }

    // Single touch - drawing mode
    if (isPinchingRef.current) {
      return
    }

    // Store initial touch position to detect scrolling vs drawing
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    isScrollingRef.current = false

    if (isSelectMode) {
      const cell = getCellFromPoint(touch.clientX, touch.clientY)
      if (cell) {
        e.preventDefault()
        if (selection && isInsideSelection(cell.row, cell.col)) {
          const snapshot: string[][] = []
          for (let r = selection.startRow; !previewDragFromLayers && r <= selection.endRow; r++) {
            const rowColors: string[] = []
            for (let c = selection.startCol; c <= selection.endCol; c++) {
              rowColors.push(getActiveLayerPixelColor(r, c))
            }
            snapshot.push(rowColors)
          }
          movingSnapshotRef.current = snapshot
          moveStartRef.current = cell
          setMoveDelta({ dRow: 0, dCol: 0 })
          setIsMovingSelection(true)
        } else {
          selectStartRef.current = cell
          setIsSelecting(true)
          onSelectionChange(normalizeRect(cell.row, cell.col, cell.row, cell.col))
        }
      }
      return
    }

    if (isLineMode) {
      // A tap places the next point of the line (see handleTouchEnd); while
      // the finger is down the line follows it.
      lineTouchRef.current = { x: touch.clientX, y: touch.clientY }
      updateLinePreview(touch.clientX, touch.clientY)
      return
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      // Account for zoom when calculating coordinates
      const x = (touch.clientX - rect.left) / zoom
      const y = (touch.clientY - rect.top) / zoom

      let row: number
      let col: number

      if (pattern === 'bricks') {
        // Horizontal offset: odd rows are offset horizontally
        row = Math.floor(y / pixelSize)
        if (row % 2 === 1) {
          const adjustedX = x - pixelSize / 2
          col = Math.floor(adjustedX / pixelSize)
          if (col < 0) col = 0
          if (col >= dimensions.cols) col = dimensions.cols - 1
        } else {
          col = Math.floor(x / pixelSize)
        }
      } else if (pattern === 'bricksVertical') {
        // Vertical offset: odd columns are offset vertically
        col = Math.floor(x / pixelSize)
        if (col % 2 === 1) {
          const adjustedY = y - pixelSize / 2
          row = Math.floor(adjustedY / pixelSize)
          if (row < 0) row = 0
          if (row >= dimensions.rows) row = dimensions.rows - 1
        } else {
          row = Math.floor(y / pixelSize)
        }
      } else {
        // Regular squares
        col = Math.floor(x / pixelSize)
        row = Math.floor(y / pixelSize)
      }

      if (col >= 0 && col < dimensions.cols && row >= 0 && row < dimensions.rows) {
        if (isSingleClickMode) {
          // Color picker / fill mode - act immediately on a single tap
          handlePixelClick(row, col, getPointInCell(touch.clientX, touch.clientY, row, col))
          e.preventDefault()
        } else {
          // Drawing mode - delay start to detect if second finger is coming or if scrolling
          // Don't preventDefault immediately - let the scroll container handle scrolling
          pendingDrawRef.current = { row, col, clientX: touch.clientX, clientY: touch.clientY }
          drawStartTimerRef.current = setTimeout(() => {
            // Only start drawing if we're still in single touch mode and not scrolling
            if (!isPinchingRef.current && !isScrollingRef.current && pendingDrawRef.current) {
              setIsDrawing(true)
              if (isFreehandPointerMode) {
                freehandDown(pendingDrawRef.current.clientX, pendingDrawRef.current.clientY)
              } else {
                handlePixelClick(pendingDrawRef.current.row, pendingDrawRef.current.col)
              }
              pendingDrawRef.current = null
            }
            drawStartTimerRef.current = null
          }, 100) // 100ms delay to allow scrolling to start first
        }
      }
    }
  }, [isSingleClickMode, isSelectMode, isLineMode, updateLinePreview, isFreehandPointerMode, previewDragFromLayers, freehandDown, cancelStroke, pattern, pixelSize, dimensions, handlePixelClick, getPointInCell, zoom, getCellFromPoint, selection, onSelectionChange, activeLayerGrid])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    // Handle pinch gesture
    if (e.touches.length === 2) {
      e.preventDefault()

      // Cancel any pending draw
      if (drawStartTimerRef.current) {
        clearTimeout(drawStartTimerRef.current)
        drawStartTimerRef.current = null
        pendingDrawRef.current = null
      }

      isPinchingRef.current = true
      if (!isLineMode) cancelStroke()
      setIsDrawing(false)

      // Initialize pinch if not already started
      if (pinchStartDistanceRef.current === null) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        pinchStartDistanceRef.current = distance
        pinchStartZoomRef.current = zoom
        return
      }

      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )

      const scale = currentDistance / pinchStartDistanceRef.current
      const newZoom = Math.max(0.5, Math.min(3.0, pinchStartZoomRef.current * scale))
      setZoom(newZoom)
      return
    }

    if (isSelectMode) {
      if (!isSelecting && !isMovingSelection) return
      const touch = e.touches[0]
      const cell = getCellFromPoint(touch.clientX, touch.clientY)
      if (!cell) return
      e.preventDefault()

      if (isSelecting && selectStartRef.current) {
        onSelectionChange(normalizeRect(selectStartRef.current.row, selectStartRef.current.col, cell.row, cell.col))
      } else if (isMovingSelection && moveStartRef.current && selection) {
        const rawDRow = cell.row - moveStartRef.current.row
        const rawDCol = cell.col - moveStartRef.current.col
        const dRow = Math.max(-selection.startRow, Math.min(dimensions.rows - 1 - selection.endRow, rawDRow))
        const dCol = Math.max(-selection.startCol, Math.min(dimensions.cols - 1 - selection.endCol, rawDCol))
        setMoveDelta({ dRow, dCol })
      }
      return
    }

    if (isLineMode) {
      if (isPinchingRef.current) return
      const touch = e.touches[0]
      const startPos = touchStartPosRef.current
      if (startPos && Math.max(Math.abs(touch.clientX - startPos.x), Math.abs(touch.clientY - startPos.y)) > 8) {
        // Moved too far to be a tap - the finger is scrolling or panning.
        isScrollingRef.current = true
        lineTouchRef.current = null
      } else if (lineTouchRef.current) {
        lineTouchRef.current = { x: touch.clientX, y: touch.clientY }
        updateLinePreview(touch.clientX, touch.clientY)
      }
      return
    }

    // Single touch - detect if scrolling or drawing
    if (isPinchingRef.current || isSingleClickMode) return

    // Check if this is a scroll gesture (movement > 8px)
    // With a separate scroll container, we can be more lenient
    if (touchStartPosRef.current && !isDrawing) {
      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)
      const movement = Math.max(deltaX, deltaY)

      // If movement is significant, it's probably scrolling
      // Cancel any pending draw since user is scrolling
      if (movement > 8) {
        isScrollingRef.current = true
        if (drawStartTimerRef.current) {
          clearTimeout(drawStartTimerRef.current)
          drawStartTimerRef.current = null
          pendingDrawRef.current = null
        }
        // Don't prevent default - let scroll container handle it
        return
      }
    }

    // If we're drawing, prevent default to allow smooth drawing
    if (isDrawing) {
      e.preventDefault()
    }

    const touch = e.touches[0]
    if (isFreehandPointerMode) {
      if (isDrawing) freehandMove(touch.clientX, touch.clientY)
      return
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      // Account for zoom when calculating coordinates
      const x = (touch.clientX - rect.left) / zoom
      const y = (touch.clientY - rect.top) / zoom

      let row: number
      let col: number

      if (pattern === 'bricks') {
        // Horizontal offset: odd rows are offset horizontally
        row = Math.floor(y / pixelSize)
        if (row % 2 === 1) {
          const adjustedX = x - pixelSize / 2
          col = Math.floor(adjustedX / pixelSize)
          if (col < 0) col = 0
          if (col >= dimensions.cols) col = dimensions.cols - 1
        } else {
          col = Math.floor(x / pixelSize)
        }
      } else if (pattern === 'bricksVertical') {
        // Vertical offset: odd columns are offset vertically
        col = Math.floor(x / pixelSize)
        if (col % 2 === 1) {
          const adjustedY = y - pixelSize / 2
          row = Math.floor(adjustedY / pixelSize)
          if (row < 0) row = 0
          if (row >= dimensions.rows) row = dimensions.rows - 1
        } else {
          row = Math.floor(y / pixelSize)
        }
      } else {
        // Regular squares
        col = Math.floor(x / pixelSize)
        row = Math.floor(y / pixelSize)
      }

      if (col >= 0 && col < dimensions.cols && row >= 0 && row < dimensions.rows) {
        handlePixelClick(row, col)
      }
    }
  }, [isDrawing, isSingleClickMode, isSelectMode, isLineMode, updateLinePreview, isFreehandPointerMode, freehandMove, cancelStroke, isSelecting, isMovingSelection, pattern, pixelSize, dimensions, handlePixelClick, zoom, getCellFromPoint, selection, onSelectionChange])

  const handleTouchEnd = useCallback((e?: TouchEvent) => {
    if (isSelectMode) {
      finishSelectInteraction()
    }
    if (isLineMode) {
      // Lifting the finger after a tap (not a scroll, pinch or cancelled
      // touch) places the point.
      const point = lineTouchRef.current
      lineTouchRef.current = null
      if (point && e?.type === 'touchend' && !isScrollingRef.current && !isPinchingRef.current) {
        // Also stops the browser's emulated mouse click from placing it twice.
        e.preventDefault()
        lineClickAt(point.x, point.y)
      }
    } else {
      finishStroke()
    }
    setIsDrawing(false)

    // Cancel any pending draw
    if (drawStartTimerRef.current) {
      clearTimeout(drawStartTimerRef.current)
      drawStartTimerRef.current = null
      pendingDrawRef.current = null
    }

    // Reset pinch state when all touches end
    if (isPinchingRef.current) {
      isPinchingRef.current = false
      pinchStartDistanceRef.current = null
    }

    // Reset touch tracking
    touchStartPosRef.current = null
    isScrollingRef.current = false
  }, [isSelectMode, isLineMode, lineClickAt, isMovingSelection, moveDelta, onSelectionMoveEnd, finishStroke])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(3.0, prev + 0.1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(0.5, prev - 0.1))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1.0)
  }, [])

  // Add non-passive touch event listeners to container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: false })
    container.addEventListener('touchcancel', handleTouchEnd, { passive: false })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)

      // Clean up any pending draw timer
      if (drawStartTimerRef.current) {
        clearTimeout(drawStartTimerRef.current)
        drawStartTimerRef.current = null
      }
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  // The moving-selection composites, cached for the duration of a drag
  // instead of recomputed on every pointer move: computing them is
  // deliberately NOT keyed on moveDelta, only on isMovingSelection turning
  // on (or layers/activeLayerIndex changing while it's on) - moveDelta
  // changes on every mousemove/touchmove while dragging, and redoing a full
  // compositeLayers walk of every non-active/above layer on each of those
  // (rather than just the cheap destination-cell lookup the paint effect
  // below needs) could block the UI on a large multi-layer drag.
  const dragComposites = useMemo(() => {
    // Previewed from the layers themselves instead (displayLayers).
    if (!isMovingSelection || previewDragFromLayers) return null
    return {
      below: compositeLayers(layers.filter((_, i) => i !== activeLayerIndex)),
      above: compositeLayers(layers.slice(activeLayerIndex + 1)),
    }
  }, [isMovingSelection, previewDragFromLayers, layers, activeLayerIndex])

  // Paints the hole (layers below the active one, at the selection's
  // original position) and the floating preview (the active layer's
  // dragged content) onto their canvases. The hole only needs repainting
  // when the drag starts or the underlying colors change - its position
  // never moves. The floating preview's transparent cells do need
  // repainting on every moveDelta change: they're rendered against the
  // non-active-layer composite *at the destination*, which shifts as the
  // selection is dragged (see the comment below the transparent-color
  // check), so this effect also depends on moveDelta despite the extra
  // repaint cost while dragging - but only for the (cheap) per-cell lookup
  // against dragComposites, not for recomputing it.
  useEffect(() => {
    if (!isSelectMode || !selection || !isMovingSelection || !dragComposites) return
    const width = selection.endCol - selection.startCol + 1
    const height = selection.endRow - selection.startRow + 1

    // For the moving-selection "hole": sits on the same opaque white
    // "paper" as the base canvas, so an empty cell here (nothing on any
    // other layer) correctly falls back to white rather than 'transparent'.
    const getBelowActiveLayerPixelColor = (row: number, col: number): string =>
      compositeCell('#ffffff', dragComposites.below[getPixelKey(row, col)])
    const getAboveActiveLayerPixelColor = (row: number, col: number): string | undefined =>
      dragComposites.above[getPixelKey(row, col)]
    // compositeLayers skips hidden layers everywhere else (the base canvas,
    // export, dragComposites itself) - the floating preview needs the same
    // rule, since the UI allows selecting and dragging a hidden layer's
    // content. Without this, every captured active-layer cell still paints
    // onto the floating canvas regardless of visibility, briefly exposing
    // pixels that are supposed to be invisible everywhere else.
    const isActiveLayerHidden = layers[activeLayerIndex]?.visible === false

    // The backing store is a few pixels per cell (not pixelSize per cell) and
    // scaled up to the on-screen size via CSS instead - at the maximum
    // canvas size and pixelSize (500 cells x 50px), a pixelSize-scaled
    // backing store would be 25,000x25,000px, around 2.5GB per canvas,
    // which can hang or crash the tab on a large selection. See
    // getPreviewCellScale for how many pixels each cell gets.
    const scale = getPreviewCellScale(width, height)
    const holeCtx = holeCanvasRef.current?.getContext('2d')
    if (holeCtx) {
      holeCtx.imageSmoothingEnabled = false
      holeCtx.clearRect(0, 0, width * scale, height * scale)
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          drawCell(holeCtx, getBelowActiveLayerPixelColor(selection.startRow + r, selection.startCol + c), c * scale, r * scale, scale)
        }
      }
    }

    const floatingCtx = floatingCanvasRef.current?.getContext('2d')
    if (floatingCtx && movingSnapshotRef.current) {
      floatingCtx.imageSmoothingEnabled = false
      floatingCtx.clearRect(0, 0, width * scale, height * scale)
      movingSnapshotRef.current.forEach((rowColors, r) => {
        rowColors.forEach((color, c) => {
          const destRow = selection.startRow + r + moveDelta.dRow
          const destCol = selection.startCol + c + moveDelta.dCol
          // Previews the real post-drop result at the destination: the
          // non-active layers there, with the dragged cell on top of them,
          // and anything on a layer above the active one still covering it.
          // A transparent source cell (or transparent half of a half-pixel)
          // deletes whatever's on the active layer at the destination when
          // the move is dropped (see pasteClipboardToGrid's TRANSPARENT
          // handling), so the destination's *current* active-layer content
          // must not show through it - `below` excludes the active layer for
          // exactly that reason. A hidden active layer contributes nothing
          // to the visible composite, same as a transparent cell.
          const dragged = isActiveLayerHidden ? TRANSPARENT : color
          const value = compositeCell(
            compositeCell(getBelowActiveLayerPixelColor(destRow, destCol), dragged),
            getAboveActiveLayerPixelColor(destRow, destCol)
          )
          drawCell(floatingCtx, value, c * scale, r * scale, scale)
        })
      })
    }
  }, [isSelectMode, selection, isMovingSelection, dragComposites, pixelSize, moveDelta])

  const previewCellScale = selection
    ? getPreviewCellScale(selection.endCol - selection.startCol + 1, selection.endRow - selection.startRow + 1)
    : 1

  const renderSquare = (row: number, col: number) => {
    return (
      <Pixel
        key={getPixelKey(row, col)}
        row={row}
        col={col}
        color={getPixelColor(row, col)}
        pixelSize={pixelSize}
        offsetAxis="none"
        offset={0}
      />
    )
  }

  const renderBrick = (row: number, col: number) => {
    const isOffset = row % 2 === 1

    return (
      <Pixel
        key={getPixelKey(row, col)}
        row={row}
        col={col}
        color={getPixelColor(row, col)}
        pixelSize={pixelSize}
        offsetAxis="x"
        offset={isOffset ? pixelSize / 2 : 0}
      />
    )
  }

  const renderBrickVertical = (row: number, col: number) => {
    const isOffset = col % 2 === 1

    return (
      <Pixel
        key={getPixelKey(row, col)}
        row={row}
        col={col}
        color={getPixelColor(row, col)}
        pixelSize={pixelSize}
        offsetAxis="y"
        offset={isOffset ? pixelSize / 2 : 0}
      />
    )
  }

  return (
    <div className={styles.zoomWrapper}>
      {/* Desktop zoom controls */}
      <div className={styles.zoomControls}>
        <button
          className={styles.zoomButton}
          onClick={handleZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          className={styles.zoomButton}
          onClick={handleZoomReset}
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className={styles.zoomButton}
          onClick={handleZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>

      {/* Zoom container */}
      <div
        ref={zoomContainerRef}
        className={styles.zoomContainer}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
        }}
      >
        <div className={styles.rulerLayout}>
          <Ruler
            count={dimensions.cols}
            pixelSize={pixelSize}
            step={colLabelStep}
            orientation="horizontal"
            side="start"
          />
          <Ruler
            count={dimensions.rows}
            pixelSize={pixelSize}
            step={rowLabelStep}
            orientation="vertical"
            side="start"
          />
          <Ruler
            count={dimensions.cols}
            pixelSize={pixelSize}
            step={colLabelStep}
            orientation="horizontal"
            side="end"
          />
          <Ruler
            count={dimensions.rows}
            pixelSize={pixelSize}
            step={rowLabelStep}
            orientation="vertical"
            side="end"
          />
          <div
            ref={containerRef}
            className={`${styles.canvas} ${isColorPickerMode ? styles.colorPickerMode : ''} ${isFillMode ? styles.fillMode : ''} ${isSelectMode ? styles.selectMode : ''} ${isLineMode ? styles.lineMode : ''}`}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${dimensions.cols}, ${pixelSize}px)`,
              gridTemplateRows: `repeat(${dimensions.rows}, ${pixelSize}px)`,
              userSelect: 'none',
              touchAction: 'none',
              position: 'relative',
              width: pattern === 'bricks' ? `${3 + dimensions.cols * pixelSize + pixelSize / 2}px` : `${3 + dimensions.cols * pixelSize}px`,
              height: pattern === 'bricksVertical' ? `${3 + dimensions.rows * pixelSize + pixelSize / 2}px` : `${3 + dimensions.rows * pixelSize}px`,
              margin: 'auto',
              flexShrink: 0,
            }}
            onMouseDown={handleContainerMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={isLineMode ? (e) => e.preventDefault() : undefined}
          >
            {Array.from({ length: dimensions.rows }).map((_, row) =>
              Array.from({ length: dimensions.cols }).map((_, col) => {
                if (pattern === 'bricks') {
                  return renderBrick(row, col)
                } else if (pattern === 'bricksVertical') {
                  return renderBrickVertical(row, col)
                } else {
                  return renderSquare(row, col)
                }
              })
            )}

            {/* Freehand layers, and the layers above the lowest one, drawn over
                the cells in stack order. Not interactive - pointer events go
                to the cells beneath, which carry the row/col the handlers
                read. Sized in CSS here; paintOverlay sets the bitmap. */}
            {hasOverlay && (
              <canvas
                ref={overlayCanvasRef}
                className={styles.freehandOverlay}
                aria-hidden="true"
                style={{ width: `${overlayWidth}px`, height: `${overlayHeight}px` }}
              />
            )}

            {isLineMode && linePreview && (
              <canvas
                ref={linePreviewCanvasRef}
                className={styles.freehandOverlay}
                aria-hidden="true"
                style={{ width: `${overlayWidth}px`, height: `${overlayHeight}px` }}
              />
            )}

            {isSelectMode && selection && (!isMovingSelection || previewDragFromLayers) && (
              <div
                className={styles.selectionMarquee}
                style={{
                  // When the drag is previewed from the layers there is no
                  // floating cell preview, so the marquee itself follows it.
                  left: `${(selection.startCol + (isMovingSelection ? moveDelta.dCol : 0)) * pixelSize}px`,
                  top: `${(selection.startRow + (isMovingSelection ? moveDelta.dRow : 0)) * pixelSize}px`,
                  width: `${(selection.endCol - selection.startCol + 1) * pixelSize}px`,
                  height: `${(selection.endRow - selection.startRow + 1) * pixelSize}px`,
                }}
              />
            )}

            {isSelectMode && selection && isMovingSelection && !previewDragFromLayers && movingSnapshotRef.current && (
              <>
                {/* Renders the other (non-active) layers for this rect onto a
                    canvas - not one <div> per cell - so the hole left by the
                    active layer's content actually shows what's really
                    underneath (rather than standing in a fake "empty" color)
                    without creating up to 250,000 DOM nodes on a full-canvas
                    selection. The drawing effect above paints its pixels. */}
                <canvas
                  ref={holeCanvasRef}
                  className={styles.selectionHole}
                  width={(selection.endCol - selection.startCol + 1) * previewCellScale}
                  height={(selection.endRow - selection.startRow + 1) * previewCellScale}
                  style={{
                    left: `${selection.startCol * pixelSize}px`,
                    top: `${selection.startRow * pixelSize}px`,
                    width: `${(selection.endCol - selection.startCol + 1) * pixelSize}px`,
                    height: `${(selection.endRow - selection.startRow + 1) * pixelSize}px`,
                  }}
                />
                <canvas
                  ref={floatingCanvasRef}
                  className={styles.selectionFloating}
                  width={(selection.endCol - selection.startCol + 1) * previewCellScale}
                  height={(selection.endRow - selection.startRow + 1) * previewCellScale}
                  style={{
                    left: `${(selection.startCol + moveDelta.dCol) * pixelSize}px`,
                    top: `${(selection.startRow + moveDelta.dRow) * pixelSize}px`,
                    width: `${(selection.endCol - selection.startCol + 1) * pixelSize}px`,
                    height: `${(selection.endRow - selection.startRow + 1) * pixelSize}px`,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

