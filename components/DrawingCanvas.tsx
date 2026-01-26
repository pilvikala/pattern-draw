'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { MatrixPattern } from '@/lib/types'
import styles from './DrawingCanvas.module.css'

interface DrawingCanvasProps {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  selectedColor: string
  grid: { [key: string]: string }
  onPixelFill: (key: string, color: string) => void
  isColorPickerMode: boolean
}

export default function DrawingCanvas({
  pattern,
  pixelSize,
  canvasWidth,
  canvasHeight,
  selectedColor,
  grid,
  onPixelFill,
  isColorPickerMode,
}: DrawingCanvasProps) {
  const [isDrawing, setIsDrawing] = useState(false)
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

  const handlePixelClick = useCallback((row: number, col: number) => {
    const key = getPixelKey(row, col)
    onPixelFill(key, selectedColor)
  }, [onPixelFill, selectedColor])

  const handleMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    if (isColorPickerMode) {
      handlePixelClick(row, col)
      return
    }
    setIsDrawing(true)
    handlePixelClick(row, col)
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !containerRef.current || isColorPickerMode) return

    const rect = containerRef.current.getBoundingClientRect()
    // Account for zoom when calculating coordinates
    // getBoundingClientRect() returns transformed coordinates, so we divide by zoom
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

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

  const handleMouseUp = () => {
    setIsDrawing(false)
  }

  const handleMouseLeave = () => {
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
        if (isColorPickerMode) {
          // Color picker mode - just pick the color immediately
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
  }, [isColorPickerMode, pattern, pixelSize, dimensions, handlePixelClick, zoom])

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

    // Single touch - detect if scrolling or drawing
    if (isPinchingRef.current || isColorPickerMode) return

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
  }, [isDrawing, isColorPickerMode, pattern, pixelSize, dimensions, handlePixelClick, zoom])

  const handleTouchEnd = useCallback(() => {
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
  }, [])

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

  const renderSquare = (row: number, col: number) => {
    const color = getPixelColor(row, col)
    const key = getPixelKey(row, col)

    return (
      <div
        key={key}
        className={styles.pixel}
        style={{
          width: `${pixelSize}px`,
          height: `${pixelSize}px`,
          backgroundColor: color,
          border: '1px solid #ddd',
        }}
        onMouseDown={(e) => handleMouseDown(e, row, col)}
      />
    )
  }

  const renderBrick = (row: number, col: number) => {
    const color = getPixelColor(row, col)
    const key = getPixelKey(row, col)
    const isOffset = row % 2 === 1
    const offset = isOffset ? pixelSize / 2 : 0

    return (
      <div
        key={key}
        className={styles.pixel}
        style={{
          width: `${pixelSize}px`,
          height: `${pixelSize}px`,
          backgroundColor: color,
          border: '1px solid #ddd',
          transform: isOffset ? `translateX(${offset}px)` : 'none',
        }}
        onMouseDown={(e) => handleMouseDown(e, row, col)}
      />
    )
  }

  const renderBrickVertical = (row: number, col: number) => {
    const color = getPixelColor(row, col)
    const key = getPixelKey(row, col)
    const isOffset = col % 2 === 1
    const offset = isOffset ? pixelSize / 2 : 0

    return (
      <div
        key={key}
        className={styles.pixel}
        style={{
          width: `${pixelSize}px`,
          height: `${pixelSize}px`,
          backgroundColor: color,
          border: '1px solid #ddd',
          transform: isOffset ? `translateY(${offset}px)` : 'none',
        }}
        onMouseDown={(e) => handleMouseDown(e, row, col)}
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
          transformOrigin: 'center center',
        }}
      >
        <div
          ref={containerRef}
          className={`${styles.canvas} ${isColorPickerMode ? styles.colorPickerMode : ''}`}
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
        </div>
      </div>
    </div>
  )
}

