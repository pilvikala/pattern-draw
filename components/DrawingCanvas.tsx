'use client'

import { useState, useRef, useEffect, useCallback, memo } from 'react'
import type { MatrixPattern, Tool, SelectionRect } from '@/lib/types'
import { normalizeRect } from '@/lib/selection'
import styles from './DrawingCanvas.module.css'

interface PixelProps {
  row: number
  col: number
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
        backgroundColor: color,
        border: '1px solid #ddd',
        transform: offsetAxis === 'none' ? 'none' : offsetAxis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)`,
      }}
    />
  )
})

interface DrawingCanvasProps {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  selectedColor: string
  // Composited view of all visible layers - what's actually rendered.
  grid: { [key: string]: string }
  // Just the active layer's cells - used for the moving-selection preview so
  // it shows only what's actually being relocated, not layers beneath it.
  activeLayerGrid: { [key: string]: string }
  // Composite of every *other* visible layer (everything except the active
  // one) - used to render the moving-selection "hole" left at the original
  // position, so it shows what's actually still there (other layers) rather
  // than a flat color standing in for "empty".
  belowActiveLayerGrid: { [key: string]: string }
  onPixelFill: (key: string, color: string) => void
  tool: Tool
  selection: SelectionRect | null
  onSelectionChange: (rect: SelectionRect | null) => void
  onSelectionMoveEnd: (deltaRow: number, deltaCol: number) => void
}

export default function DrawingCanvas({
  pattern,
  pixelSize,
  canvasWidth,
  canvasHeight,
  selectedColor,
  grid,
  activeLayerGrid,
  belowActiveLayerGrid,
  onPixelFill,
  tool,
  selection,
  onSelectionChange,
  onSelectionMoveEnd,
}: DrawingCanvasProps) {
  const isColorPickerMode = tool === 'colorPicker'
  const isFillMode = tool === 'fill'
  const isSelectMode = tool === 'select'
  // Fill and color-picker act on a single click rather than drag-painting;
  // select uses its own drag semantics (marquee / move), handled separately.
  const isSingleClickMode = isColorPickerMode || isFillMode

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
  const [zoom, setZoom] = useState(1.0)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomContainerRef = useRef<HTMLDivElement>(null)
  const pinchStartDistanceRef = useRef<number | null>(null)
  const pinchStartZoomRef = useRef<number>(1.0)
  const isPinchingRef = useRef(false)
  const drawStartTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingDrawRef = useRef<{ row: number; col: number } | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const isScrollingRef = useRef(false)

  const dimensions = { cols: canvasWidth, rows: canvasHeight }

  const getPixelKey = (row: number, col: number): string => {
    return `${row},${col}`
  }

  const getPixelColor = (row: number, col: number): string => {
    const key = getPixelKey(row, col)
    return grid[key] || '#ffffff'
  }

  // For the moving-selection "hole": sits on the same opaque white "paper"
  // as the base canvas, so an empty cell here (nothing on any other layer)
  // correctly falls back to white rather than 'transparent'.
  const getBelowActiveLayerPixelColor = (row: number, col: number): string => {
    const key = getPixelKey(row, col)
    return belowActiveLayerGrid[key] || '#ffffff'
  }

  const getActiveLayerPixelColor = (row: number, col: number): string => {
    const key = getPixelKey(row, col)
    // Unlike the base canvas (which sits on an opaque white "paper"), the
    // moving-selection preview floats above the already-rendered composite,
    // so an empty active-layer cell must stay see-through here - falling
    // back to white would paint over whatever's on a layer beneath it.
    return activeLayerGrid[key] || 'transparent'
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

  const handlePixelClick = useCallback((row: number, col: number) => {
    const key = getPixelKey(row, col)
    onPixelFill(key, selectedColor)
  }, [onPixelFill, selectedColor])

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

  const handleMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    if (isSelectMode) {
      if (selection && isInsideSelection(row, col)) {
        const snapshot: string[][] = []
        for (let r = selection.startRow; r <= selection.endRow; r++) {
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
    if (isSingleClickMode) {
      handlePixelClick(row, col)
      return
    }
    setIsDrawing(true)
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

    if (!isDrawing || !containerRef.current || isSingleClickMode) return

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
    setIsDrawing(false)
  }

  const handleMouseLeave = () => {
    if (isSelectMode) {
      finishSelectInteraction()
      return
    }
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
          for (let r = selection.startRow; r <= selection.endRow; r++) {
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
          handlePixelClick(row, col)
          e.preventDefault()
        } else {
          // Drawing mode - delay start to detect if second finger is coming or if scrolling
          // Don't preventDefault immediately - let the scroll container handle scrolling
          pendingDrawRef.current = { row, col }
          drawStartTimerRef.current = setTimeout(() => {
            // Only start drawing if we're still in single touch mode and not scrolling
            if (!isPinchingRef.current && !isScrollingRef.current && pendingDrawRef.current) {
              setIsDrawing(true)
              handlePixelClick(pendingDrawRef.current.row, pendingDrawRef.current.col)
              pendingDrawRef.current = null
            }
            drawStartTimerRef.current = null
          }, 100) // 100ms delay to allow scrolling to start first
        }
      }
    }
  }, [isSingleClickMode, isSelectMode, pattern, pixelSize, dimensions, handlePixelClick, zoom, getCellFromPoint, selection, onSelectionChange, activeLayerGrid])

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
  }, [isDrawing, isSingleClickMode, isSelectMode, isSelecting, isMovingSelection, pattern, pixelSize, dimensions, handlePixelClick, zoom, getCellFromPoint, selection, onSelectionChange])

  const handleTouchEnd = useCallback(() => {
    if (isSelectMode) {
      finishSelectInteraction()
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
  }, [isSelectMode, isMovingSelection, moveDelta, onSelectionMoveEnd])

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

  // Paints the hole (layers below the active one, at the selection's
  // original position) and the floating preview (the active layer's
  // dragged content) onto their canvases. Both only need repainting when
  // the drag starts or the underlying colors change - not on every
  // moveDelta update, since that only moves the floating canvas via CSS.
  useEffect(() => {
    if (!isSelectMode || !selection || !isMovingSelection) return
    const width = selection.endCol - selection.startCol + 1
    const height = selection.endRow - selection.startRow + 1

    const holeCtx = holeCanvasRef.current?.getContext('2d')
    if (holeCtx) {
      holeCtx.clearRect(0, 0, width * pixelSize, height * pixelSize)
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          holeCtx.fillStyle = getBelowActiveLayerPixelColor(selection.startRow + r, selection.startCol + c)
          holeCtx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize)
        }
      }
    }

    const floatingCtx = floatingCanvasRef.current?.getContext('2d')
    if (floatingCtx && movingSnapshotRef.current) {
      floatingCtx.clearRect(0, 0, width * pixelSize, height * pixelSize)
      movingSnapshotRef.current.forEach((rowColors, r) => {
        rowColors.forEach((color, c) => {
          floatingCtx.fillStyle = color
          floatingCtx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize)
        })
      })
    }
  }, [isSelectMode, selection, isMovingSelection, belowActiveLayerGrid, pixelSize])

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
        <div
          ref={containerRef}
          className={`${styles.canvas} ${isColorPickerMode ? styles.colorPickerMode : ''} ${isFillMode ? styles.fillMode : ''} ${isSelectMode ? styles.selectMode : ''}`}
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

          {isSelectMode && selection && !isMovingSelection && (
            <div
              className={styles.selectionMarquee}
              style={{
                left: `${selection.startCol * pixelSize}px`,
                top: `${selection.startRow * pixelSize}px`,
                width: `${(selection.endCol - selection.startCol + 1) * pixelSize}px`,
                height: `${(selection.endRow - selection.startRow + 1) * pixelSize}px`,
              }}
            />
          )}

          {isSelectMode && selection && isMovingSelection && movingSnapshotRef.current && (
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
                width={(selection.endCol - selection.startCol + 1) * pixelSize}
                height={(selection.endRow - selection.startRow + 1) * pixelSize}
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
                width={(selection.endCol - selection.startCol + 1) * pixelSize}
                height={(selection.endRow - selection.startRow + 1) * pixelSize}
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
  )
}

