'use client'

import { useState, useEffect } from 'react'
import DrawingCanvas from '@/components/DrawingCanvas'
import ColorPicker from '@/components/ColorPicker'
import CompactColorPicker from '@/components/CompactColorPicker'
import ColorPalette from '@/components/ColorPalette'
import Controls from '@/components/Controls'
import MobileMenu from '@/components/MobileMenu'
import styles from './page.module.css'

export type MatrixPattern = 'squares' | 'bricks' | 'bricksVertical'

export interface DrawingData {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  colors: { [key: string]: string }
  grid: { [key: string]: string }
}

export default function Home() {
  const [selectedColor, setSelectedColor] = useState('#000000')
  const [savedColors, setSavedColors] = useState<string[]>([])
  const [pattern, setPattern] = useState<MatrixPattern>('squares')
  const [pixelSize, setPixelSize] = useState(15)
  const [canvasWidth, setCanvasWidth] = useState(20)
  const [canvasHeight, setCanvasHeight] = useState(20)
  const [tempCanvasWidth, setTempCanvasWidth] = useState('20')
  const [tempCanvasHeight, setTempCanvasHeight] = useState('20')
  const [grid, setGrid] = useState<{ [key: string]: string }>({})
  const [isColorPickerMode, setIsColorPickerMode] = useState(false)

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('pattern-draw-data')
    if (saved) {
      try {
        const data: DrawingData = JSON.parse(saved)
        setPattern(data.pattern || 'squares')
        setPixelSize(data.pixelSize || 15)
        const width = data.canvasWidth || 20
        const height = data.canvasHeight || 20
        setCanvasWidth(width)
        setCanvasHeight(height)
        setTempCanvasWidth(width.toString())
        setTempCanvasHeight(height.toString())
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
        const loadFromUrl = async () => {
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
                writer.write(bytes)
                writer.close()
                
                const decompressed = await new Response(stream.readable).arrayBuffer()
                decoded = new TextDecoder().decode(decompressed)
              } else {
                decoded = atob(base64Padded)
              }
            } catch (e) {
              // Not compressed, decode as base64
              decoded = atob(base64Padded)
            }
            
            // Try compact format first
            const compactData = deserializeDrawing(decoded)
            if (compactData) {
              setPattern(compactData.pattern || 'squares')
              setPixelSize(compactData.pixelSize || 15)
              const width = compactData.canvasWidth || 20
              const height = compactData.canvasHeight || 20
              setCanvasWidth(width)
              setCanvasHeight(height)
              setTempCanvasWidth(width.toString())
              setTempCanvasHeight(height.toString())
              setSavedColors(Object.values(compactData.colors || {}))
              setGrid(compactData.grid || {})
              return
            }
            
            // Fallback to old JSON format
            try {
              const jsonStr = decodeURIComponent(decoded)
              const data: DrawingData = JSON.parse(jsonStr)
              setPattern(data.pattern || 'squares')
              setPixelSize(data.pixelSize || 15)
              const width = data.canvasWidth || 20
              const height = data.canvasHeight || 20
              setCanvasWidth(width)
              setCanvasHeight(height)
              setTempCanvasWidth(width.toString())
              setTempCanvasHeight(height.toString())
              setSavedColors(Object.values(data.colors || {}))
              setGrid(data.grid || {})
            } catch (e2) {
              console.error('Failed to parse as JSON', e2)
            }
          } catch (e) {
            console.error('Failed to load from URL', e)
          }
        }
        loadFromUrl()
      }
    }
  }, [])

  // Save to local storage whenever data changes
  useEffect(() => {
    const data: DrawingData = {
      pattern,
      pixelSize,
      canvasWidth,
      canvasHeight,
      colors: savedColors.reduce((acc, color, idx) => {
        acc[idx.toString()] = color
        return acc
      }, {} as { [key: string]: string }),
      grid,
    }
    localStorage.setItem('pattern-draw-data', JSON.stringify(data))
  }, [pattern, pixelSize, canvasWidth, canvasHeight, savedColors, grid])

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

  const handleSetCanvasSize = () => {
    const width = parseInt(tempCanvasWidth)
    const height = parseInt(tempCanvasHeight)
    if (!isNaN(width) && width >= 10 && width <= 200) {
      setCanvasWidth(width)
    } else {
      setTempCanvasWidth(canvasWidth.toString())
    }
    if (!isNaN(height) && height >= 10 && height <= 200) {
      setCanvasHeight(height)
    } else {
      setTempCanvasHeight(canvasHeight.toString())
    }
  }

  // Compact serialization functions
  const serializeDrawing = (data: DrawingData): string => {
    // Pattern: 's'=squares, 'b'=bricks, 'v'=bricksVertical
    const patternChar = data.pattern === 'squares' ? 's' : data.pattern === 'bricks' ? 'b' : 'v'
    
    // Colors as array (more compact than object)
    const colorsArray = Object.values(data.colors)
    
    // Grid: only store non-white pixels in compact format "row,col:color"
    const gridEntries: string[] = []
    Object.entries(data.grid).forEach(([key, color]) => {
      if (color && color !== '#ffffff' && color !== '#fff') {
        gridEntries.push(`${key}:${color}`)
      }
    })
    
    // Compact format: pattern|pixelSize|width|height|colors|grid
    // Colors: comma-separated hex values
    // Grid: semicolon-separated entries
    const compact = [
      patternChar,
      data.pixelSize,
      data.canvasWidth,
      data.canvasHeight,
      colorsArray.join(','),
      gridEntries.join(';')
    ].join('|')
    
    return compact
  }

  const deserializeDrawing = (compact: string): DrawingData | null => {
    try {
      const parts = compact.split('|')
      if (parts.length < 6) return null
      
      const patternChar = parts[0]
      const pattern: MatrixPattern = 
        patternChar === 's' ? 'squares' : 
        patternChar === 'b' ? 'bricks' : 'bricksVertical'
      
      const pixelSize = parseInt(parts[1]) || 15
      const canvasWidth = parseInt(parts[2]) || 20
      const canvasHeight = parseInt(parts[3]) || 20
      
      const colorsArray = parts[4] ? parts[4].split(',').filter(Boolean) : []
      const colors = colorsArray.reduce((acc, color, idx) => {
        acc[idx.toString()] = color
        return acc
      }, {} as { [key: string]: string })
      
      const grid: { [key: string]: string } = {}
      if (parts[5]) {
        parts[5].split(';').forEach((entry) => {
          const [key, color] = entry.split(':')
          if (key && color) {
            grid[key] = color
          }
        })
      }
      
      return {
        pattern,
        pixelSize,
        canvasWidth,
        canvasHeight,
        colors,
        grid,
      }
    } catch (e) {
      console.error('Failed to deserialize', e)
      return null
    }
  }

  const handleShare = async () => {
    const data: DrawingData = {
      pattern,
      pixelSize,
      canvasWidth,
      canvasHeight,
      colors: savedColors.reduce((acc, color, idx) => {
        acc[idx.toString()] = color
        return acc
      }, {} as { [key: string]: string }),
      grid,
    }
    
    // Use compact serialization
    const compact = serializeDrawing(data)
    
    // Try compression if available (modern browsers)
    let encoded: string
    if (typeof CompressionStream !== 'undefined') {
      try {
        const stream = new CompressionStream('gzip')
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()
        writer.write(encoder.encode(compact))
        writer.close()
        
        const compressed = await new Response(stream.readable).arrayBuffer()
        // Convert to base64url (URL-safe)
        encoded = btoa(String.fromCharCode(...new Uint8Array(compressed)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')
      } catch (e) {
        // Fallback to uncompressed
        encoded = btoa(compact)
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')
      }
    } else {
      // Fallback: just base64 encode
      encoded = btoa(compact)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    }
    
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

    // Use the fixed canvas dimensions
    const cols = canvasWidth
    const rows = canvasHeight

    // For brick patterns, add extra dimension for offset
    const widthOffset = pattern === 'bricks' ? pixelSize / 2 : 0
    const heightOffset = pattern === 'bricksVertical' ? pixelSize / 2 : 0
    canvas.width = cols * pixelSize + widthOffset
    canvas.height = rows * pixelSize + heightOffset

    // Fill background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grid with borders
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${row},${col}`
        const color = grid[key] || '#ffffff'
        
        let x = col * pixelSize
        let y = row * pixelSize
        
        // Adjust position for brick patterns
        if (pattern === 'bricks' && row % 2 === 1) {
          x += pixelSize / 2
        } else if (pattern === 'bricksVertical' && col % 2 === 1) {
          y += pixelSize / 2
        }
        
        // Fill pixel
        ctx.fillStyle = color
        ctx.fillRect(x, y, pixelSize, pixelSize)
        
        // Draw border
        ctx.strokeRect(x, y, pixelSize, pixelSize)
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


  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Pattern Draw</h1>
          <MobileMenu
            pattern={pattern}
            pixelSize={pixelSize}
            tempCanvasWidth={tempCanvasWidth}
            tempCanvasHeight={tempCanvasHeight}
            onPatternChange={setPattern}
            onPixelSizeChange={setPixelSize}
            onTempCanvasWidthChange={setTempCanvasWidth}
            onTempCanvasHeightChange={setTempCanvasHeight}
            onSetCanvasSize={handleSetCanvasSize}
            onClear={handleClear}
            onShare={handleShare}
            onDownload={handleDownload}
            onPrint={() => {}}
          />
        </div>

        <div className={styles.topBar}>
          <div className={styles.colorTools}>
            <CompactColorPicker
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
        </div>

        <div className={styles.canvasContainer}>
          <DrawingCanvas
            pattern={pattern}
            pixelSize={pixelSize}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            selectedColor={selectedColor}
            grid={grid}
            onPixelFill={handlePixelFill}
            isColorPickerMode={isColorPickerMode}
          />
        </div>

        {/* Desktop controls - hidden on mobile */}
        <div className={styles.desktopControls}>
          <Controls
            pattern={pattern}
            pixelSize={pixelSize}
            tempCanvasWidth={tempCanvasWidth}
            tempCanvasHeight={tempCanvasHeight}
            onPatternChange={setPattern}
            onPixelSizeChange={setPixelSize}
            onTempCanvasWidthChange={setTempCanvasWidth}
            onTempCanvasHeightChange={setTempCanvasHeight}
            onSetCanvasSize={handleSetCanvasSize}
            onClear={handleClear}
            onShare={handleShare}
            onDownload={handleDownload}
            onPrint={() => {}}
          />
        </div>

        {/* Desktop color section - hidden on mobile */}
        <div className={styles.desktopColorSection}>
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
      </div>
    </main>
  )
}

