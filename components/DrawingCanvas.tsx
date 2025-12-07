'use client'

import { useState, useRef, useEffect } from 'react'
import { MatrixPattern } from '@/app/page'
import styles from './DrawingCanvas.module.css'

interface DrawingCanvasProps {
  pattern: MatrixPattern
  pixelSize: number
  selectedColor: string
  grid: { [key: string]: string }
  onPixelFill: (key: string, color: string) => void
  isColorPickerMode: boolean
}

export default function DrawingCanvas({
  pattern,
  pixelSize,
  selectedColor,
  grid,
  onPixelFill,
  isColorPickerMode,
}: DrawingCanvasProps) {
  const [isDrawing, setIsDrawing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ cols: 40, rows: 30 })

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const containerWidth = rect.width
        const containerHeight = rect.height
        
        // For mobile, use full container height; for desktop, limit to reasonable size
        const isMobile = window.innerWidth < 768
        const maxHeight = isMobile ? containerHeight : Math.min(containerHeight, 600)
        
        const cols = Math.floor(containerWidth / pixelSize)
        const rows = Math.floor(maxHeight / pixelSize)
        setDimensions({ cols, rows })
      }
    }

    updateDimensions()
    
    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    window.addEventListener('resize', updateDimensions)
    return () => {
      window.removeEventListener('resize', updateDimensions)
      resizeObserver.disconnect()
    }
  }, [pixelSize])

  const getPixelKey = (row: number, col: number): string => {
    return `${row},${col}`
  }

  const getPixelColor = (row: number, col: number): string => {
    const key = getPixelKey(row, col)
    return grid[key] || '#ffffff'
  }

  const handlePixelClick = (row: number, col: number) => {
    const key = getPixelKey(row, col)
    onPixelFill(key, selectedColor)
  }

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
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const row = Math.floor(y / pixelSize)
    
    // For brick pattern, need to account for offset when calculating column
    let col: number
    if (pattern === 'bricks' && row % 2 === 1) {
      // For offset rows, adjust column calculation
      const adjustedX = x - pixelSize / 2
      col = Math.floor(adjustedX / pixelSize)
      // Clamp to valid range
      if (col < 0) col = 0
      if (col >= dimensions.cols) col = dimensions.cols - 1
    } else {
      col = Math.floor(x / pixelSize)
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

  const handleTouchStart = (e: React.TouchEvent, row: number, col: number) => {
    e.preventDefault()
    setIsDrawing(true)
    handlePixelClick(row, col)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    
    const touch = e.touches[0]
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top
      
      const row = Math.floor(y / pixelSize)
      
      // For brick pattern, need to account for offset when calculating column
      let col: number
      if (pattern === 'bricks' && row % 2 === 1) {
        // For offset rows, adjust column calculation
        const adjustedX = x - pixelSize / 2
        col = Math.floor(adjustedX / pixelSize)
        // Clamp to valid range
        if (col < 0) col = 0
        if (col >= dimensions.cols) col = dimensions.cols - 1
      } else {
        col = Math.floor(x / pixelSize)
      }
      
      if (col >= 0 && col < dimensions.cols && row >= 0 && row < dimensions.rows) {
        handlePixelClick(row, col)
      }
    }
  }

  const handleTouchEnd = () => {
    setIsDrawing(false)
  }

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
        onTouchStart={(e) => handleTouchStart(e, row, col)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
        onTouchStart={(e) => handleTouchStart(e, row, col)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    )
  }

  return (
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
        width: pattern === 'bricks' ? `${dimensions.cols * pixelSize + pixelSize / 2}px` : `${dimensions.cols * pixelSize}px`,
        height: `${dimensions.rows * pixelSize}px`,
        maxWidth: '100%',
        maxHeight: '100%',
      }}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {Array.from({ length: dimensions.rows }).map((_, row) =>
        Array.from({ length: dimensions.cols }).map((_, col) =>
          pattern === 'bricks' ? renderBrick(row, col) : renderSquare(row, col)
        )
      )}
    </div>
  )
}

