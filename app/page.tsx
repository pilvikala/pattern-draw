'use client'

import { useState, useEffect } from 'react'
import DrawingCanvas from '@/components/DrawingCanvas'
import ColorPicker from '@/components/ColorPicker'
import ColorPalette from '@/components/ColorPalette'
import Controls from '@/components/Controls'
import styles from './page.module.css'

export type MatrixPattern = 'squares' | 'bricks'

export interface DrawingData {
  pattern: MatrixPattern
  pixelSize: number
  colors: { [key: string]: string }
  grid: { [key: string]: string }
}

export default function Home() {
  const [selectedColor, setSelectedColor] = useState('#000000')
  const [savedColors, setSavedColors] = useState<string[]>([])
  const [pattern, setPattern] = useState<MatrixPattern>('squares')
  const [pixelSize, setPixelSize] = useState(20)
  const [grid, setGrid] = useState<{ [key: string]: string }>({})
  const [isColorPickerMode, setIsColorPickerMode] = useState(false)

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('pattern-draw-data')
    if (saved) {
      try {
        const data: DrawingData = JSON.parse(saved)
        setPattern(data.pattern || 'squares')
        setPixelSize(data.pixelSize || 20)
        setSavedColors(Object.values(data.colors || {}))
        setGrid(data.grid || {})
      } catch (e) {
        console.error('Failed to load from localStorage', e)
      }
    }
  }, [])

  // Load from URL if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const encoded = params.get('drawing')
      if (encoded) {
        try {
          const decoded = decodeURIComponent(atob(encoded))
          const data: DrawingData = JSON.parse(decoded)
          setPattern(data.pattern || 'squares')
          setPixelSize(data.pixelSize || 20)
          setSavedColors(Object.values(data.colors || {}))
          setGrid(data.grid || {})
        } catch (e) {
          console.error('Failed to load from URL', e)
        }
      }
    }
  }, [])

  // Save to local storage whenever data changes
  useEffect(() => {
    const data: DrawingData = {
      pattern,
      pixelSize,
      colors: savedColors.reduce((acc, color, idx) => {
        acc[idx.toString()] = color
        return acc
      }, {} as { [key: string]: string }),
      grid,
    }
    localStorage.setItem('pattern-draw-data', JSON.stringify(data))
  }, [pattern, pixelSize, savedColors, grid])

  const handleColorSelect = (color: string) => {
    setSelectedColor(color)
  }

  const handleColorSave = (color: string) => {
    if (!savedColors.includes(color)) {
      setSavedColors([...savedColors, color])
    }
  }

  const handleColorPick = (color: string) => {
    setSelectedColor(color)
    handleColorSave(color)
  }

  const handlePixelFill = (key: string, color: string) => {
    if (isColorPickerMode) {
      // Pick color from pixel
      const pixelColor = grid[key] || '#ffffff'
      setSelectedColor(pixelColor)
      handleColorSave(pixelColor)
      setIsColorPickerMode(false)
    } else {
      // Fill pixel with color
      setGrid((prev) => ({ ...prev, [key]: color }))
    }
  }

  const handleClear = () => {
    setGrid({})
  }

  const handleShare = () => {
    const data: DrawingData = {
      pattern,
      pixelSize,
      colors: savedColors.reduce((acc, color, idx) => {
        acc[idx.toString()] = color
        return acc
      }, {} as { [key: string]: string }),
      grid,
    }
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)))
    const url = `${window.location.origin}${window.location.pathname}?drawing=${encoded}`
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!')
      })
    } else {
      prompt('Copy this link:', url)
    }
  }

  const handleDownload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Calculate dimensions from grid data
    let maxRow = 0
    let maxCol = 0
    Object.keys(grid).forEach((key) => {
      const [row, col] = key.split(',').map(Number)
      maxRow = Math.max(maxRow, row)
      maxCol = Math.max(maxCol, col)
    })

    // Use default dimensions if grid is empty
    const cols = maxCol > 0 ? maxCol + 1 : 40
    const rows = maxRow > 0 ? maxRow + 1 : 30

    // For brick pattern, add extra width for offset
    const widthOffset = pattern === 'bricks' ? pixelSize / 2 : 0
    canvas.width = cols * pixelSize + widthOffset
    canvas.height = rows * pixelSize

    // Fill background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${row},${col}`
        const color = grid[key]
        if (color) {
          ctx.fillStyle = color
          if (pattern === 'bricks' && row % 2 === 1) {
            // Offset for brick pattern
            ctx.fillRect(
              col * pixelSize + pixelSize / 2,
              row * pixelSize,
              pixelSize,
              pixelSize
            )
          } else {
            ctx.fillRect(col * pixelSize, row * pixelSize, pixelSize, pixelSize)
          }
        }
      }
    }

    // Download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'pattern-draw.png'
        a.click()
        URL.revokeObjectURL(url)
      }
    })
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Pattern Draw</h1>
        
        <div className={styles.toolbar}>
          <Controls
            pattern={pattern}
            pixelSize={pixelSize}
            onPatternChange={setPattern}
            onPixelSizeChange={setPixelSize}
            onClear={handleClear}
            onShare={handleShare}
            onDownload={handleDownload}
            onPrint={handlePrint}
          />
        </div>

        <div className={styles.colorSection}>
          <ColorPicker
            selectedColor={selectedColor}
            onColorChange={setSelectedColor}
            onColorSave={handleColorSave}
            isColorPickerMode={isColorPickerMode}
            onColorPickerModeToggle={setIsColorPickerMode}
          />
          <ColorPalette
            colors={savedColors}
            selectedColor={selectedColor}
            onColorSelect={handleColorSelect}
            onColorPick={handleColorPick}
            onColorRemove={(color) => {
              setSavedColors(savedColors.filter((c) => c !== color))
            }}
          />
        </div>

        <div className={styles.canvasContainer}>
          <DrawingCanvas
            pattern={pattern}
            pixelSize={pixelSize}
            selectedColor={selectedColor}
            grid={grid}
            onPixelFill={handlePixelFill}
            isColorPickerMode={isColorPickerMode}
          />
        </div>
      </div>
    </main>
  )
}

