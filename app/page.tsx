'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import DrawingCanvas from '@/components/DrawingCanvas'
import ColorPicker from '@/components/ColorPicker'
import CompactColorPicker from '@/components/CompactColorPicker'
import ColorPalette from '@/components/ColorPalette'
import Controls from '@/components/Controls'
import MobileMenu from '@/components/MobileMenu'
import { encodeDrawing, decodeDrawing } from '@/lib/serialization'
import type { DrawingData, MatrixPattern } from '@/lib/types'
import UserMenu from '@/components/UserMenu'
import styles from './page.module.css'

// Re-export types for backward compatibility
export type { MatrixPattern, DrawingData } from '@/lib/types'

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
  const gridRef = useRef<{ [key: string]: string }>({})
  const [isColorPickerMode, setIsColorPickerMode] = useState(false)
  
  // Undo/Redo history
  const [history, setHistory] = useState<{ [key: string]: string }[]>([{}])
  const [historyIndex, setHistoryIndex] = useState(0)
  const isUndoRedoRef = useRef(false)
  const historyRef = useRef<{ [key: string]: string }[]>([{}])
  const historyIndexRef = useRef(0)
  const lastSavedGridRef = useRef<{ [key: string]: string }>({})
  const historyDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Keep grid ref in sync
  useEffect(() => {
    gridRef.current = grid
  }, [grid])
  
  // Keep refs in sync with state
  useEffect(() => {
    historyRef.current = history
  }, [history])
  
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])
  
  // Function to save current grid to history (debounced)
  const saveToHistory = useCallback(() => {
    const currentGrid = gridRef.current
    
    // Check if grid has actually changed
    const currentGridStr = JSON.stringify(currentGrid)
    const lastSavedStr = JSON.stringify(lastSavedGridRef.current)
    
    if (currentGridStr === lastSavedStr) {
      return // No change, don't save
    }
    
    // Clear existing timer
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current)
    }
    
    // Set new timer to save after 500ms
    historyDebounceTimerRef.current = setTimeout(() => {
      if (!isUndoRedoRef.current) {
        setHistory((hist) => {
          const currentIdx = historyIndexRef.current
          const newHistory = hist.slice(0, currentIdx + 1)
          // Add new state to history
          newHistory.push(currentGrid)
          // Limit history to 50 states to prevent memory issues
          if (newHistory.length > 50) {
            newHistory.shift()
            const updatedHistory = newHistory
            historyRef.current = updatedHistory
            setHistoryIndex(updatedHistory.length - 1)
            historyIndexRef.current = updatedHistory.length - 1
            lastSavedGridRef.current = currentGrid
            return updatedHistory
          }
          const updatedHistory = newHistory
          historyRef.current = updatedHistory
          const newIdx = updatedHistory.length - 1
          setHistoryIndex(newIdx)
          historyIndexRef.current = newIdx
          lastSavedGridRef.current = currentGrid
          return updatedHistory
        })
      }
    }, 500)
  }, [])
  
  // Save current grid to history immediately (bypass debounce)
  const saveToHistoryImmediate = useCallback(() => {
    const currentGrid = gridRef.current
    
    // Clear any pending timer
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current)
      historyDebounceTimerRef.current = null
    }
    
    // Check if grid has actually changed
    const currentGridStr = JSON.stringify(currentGrid)
    const lastSavedStr = JSON.stringify(lastSavedGridRef.current)
    
    if (currentGridStr === lastSavedStr) {
      return // No change, don't save
    }
    
    if (!isUndoRedoRef.current) {
      setHistory((hist) => {
        const currentIdx = historyIndexRef.current
        const newHistory = hist.slice(0, currentIdx + 1)
        // Add new state to history
        newHistory.push(currentGrid)
        // Limit history to 50 states to prevent memory issues
        if (newHistory.length > 50) {
          newHistory.shift()
          const updatedHistory = newHistory
          historyRef.current = updatedHistory
          setHistoryIndex(updatedHistory.length - 1)
          historyIndexRef.current = updatedHistory.length - 1
          lastSavedGridRef.current = currentGrid
          return updatedHistory
        }
        const updatedHistory = newHistory
        historyRef.current = updatedHistory
        const newIdx = updatedHistory.length - 1
        setHistoryIndex(newIdx)
        historyIndexRef.current = newIdx
        lastSavedGridRef.current = currentGrid
        return updatedHistory
      })
    }
  }, [])
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (historyDebounceTimerRef.current) {
        clearTimeout(historyDebounceTimerRef.current)
      }
    }
  }, [])

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
        const initialGrid = data.grid || {}
        setGrid(initialGrid)
        gridRef.current = initialGrid
        // Initialize history with loaded grid
        const initialHistory = [initialGrid]
        setHistory(initialHistory)
        historyRef.current = initialHistory
        setHistoryIndex(0)
        historyIndexRef.current = 0
        lastSavedGridRef.current = initialGrid
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
            const data = await decodeDrawing(encoded)
            if (data) {
              setPattern(data.pattern || 'squares')
              setPixelSize(data.pixelSize || 15)
              const width = data.canvasWidth || 20
              const height = data.canvasHeight || 20
              setCanvasWidth(width)
              setCanvasHeight(height)
              setTempCanvasWidth(width.toString())
              setTempCanvasHeight(height.toString())
              setSavedColors(Object.values(data.colors || {}))
              const initialGrid = data.grid || {}
              setGrid(initialGrid)
              gridRef.current = initialGrid
              // Initialize history with loaded grid
              const initialHistory = [initialGrid]
              setHistory(initialHistory)
              historyRef.current = initialHistory
              setHistoryIndex(0)
              historyIndexRef.current = 0
              lastSavedGridRef.current = initialGrid
            }
          } catch (e) {
            console.error('Failed to load from URL', e)
          }
        }
        loadFromUrl()
      }
    }
  }, [])

  // Save function that can be called manually - memoized with useCallback
  const saveToLocalStorage = useCallback(() => {
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
    try {
      localStorage.setItem('pattern-draw-data', JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save to localStorage', e)
    }
  }, [pattern, pixelSize, canvasWidth, canvasHeight, savedColors, grid])

  // Save to local storage whenever data changes
  useEffect(() => {
    saveToLocalStorage()
  }, [saveToLocalStorage])

  // Save immediately when page is about to be hidden/unloaded (mobile app switching)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveToLocalStorage()
      }
    }

    const handlePageHide = () => {
      saveToLocalStorage()
    }

    const handleBeforeUnload = () => {
      saveToLocalStorage()
    }

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [saveToLocalStorage])

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
      setGrid((prev) => {
        const newGrid = { ...prev, [key]: color }
        gridRef.current = newGrid
        
        // Schedule history save (debounced) if not in the middle of undo/redo
        if (!isUndoRedoRef.current) {
          saveToHistory()
        }
        
        return newGrid
      })
    }
  }
  
  const handleUndo = () => {
    // Save current state immediately if there are pending changes
    saveToHistoryImmediate()
    
    // Use setTimeout to ensure state updates are processed
    setTimeout(() => {
      const currentIdx = historyIndexRef.current
      const currentHistory = historyRef.current
      if (currentIdx > 0) {
        isUndoRedoRef.current = true
        const newIndex = currentIdx - 1
        const newGrid = currentHistory[newIndex]
        setHistoryIndex(newIndex)
        historyIndexRef.current = newIndex
        setGrid(newGrid)
        gridRef.current = newGrid
        lastSavedGridRef.current = newGrid
        // Reset flag after state update
        setTimeout(() => {
          isUndoRedoRef.current = false
        }, 0)
      }
    }, 10)
  }
  
  const handleRedo = () => {
    // Save current state immediately if there are pending changes
    saveToHistoryImmediate()
    
    // Use setTimeout to ensure state updates are processed
    setTimeout(() => {
      const currentIdx = historyIndexRef.current
      const currentHistory = historyRef.current
      if (currentIdx < currentHistory.length - 1) {
        isUndoRedoRef.current = true
        const newIndex = currentIdx + 1
        const newGrid = currentHistory[newIndex]
        setHistoryIndex(newIndex)
        historyIndexRef.current = newIndex
        setGrid(newGrid)
        gridRef.current = newGrid
        lastSavedGridRef.current = newGrid
        // Reset flag after state update
        setTimeout(() => {
          isUndoRedoRef.current = false
        }, 0)
      }
    }, 10)
  }

  const handleClear = () => {
    // Clear any pending history save
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current)
      historyDebounceTimerRef.current = null
    }
    
    const emptyGrid = {}
    setGrid(emptyGrid)
    gridRef.current = emptyGrid
    // Add clear to history immediately (not debounced)
    setHistory((hist) => {
      const currentIdx = historyIndexRef.current
      const newHistory = hist.slice(0, currentIdx + 1)
      newHistory.push(emptyGrid)
      if (newHistory.length > 50) {
        newHistory.shift()
        const updatedHistory = newHistory
        historyRef.current = updatedHistory
        const newIdx = updatedHistory.length - 1
        setHistoryIndex(newIdx)
        historyIndexRef.current = newIdx
        lastSavedGridRef.current = emptyGrid
        return updatedHistory
      }
      const updatedHistory = newHistory
      historyRef.current = updatedHistory
      const newIdx = updatedHistory.length - 1
      setHistoryIndex(newIdx)
      historyIndexRef.current = newIdx
      lastSavedGridRef.current = emptyGrid
      return updatedHistory
    })
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
    
    const encoded = await encodeDrawing(data)
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
          <div className={styles.titleContainer}>
            <h1 className={styles.title}>Pattern Draw</h1>
            {(history.length > 1 || historyIndex < history.length - 1) && (
              <div className={styles.undoRedoButtons}>
                <button
                  onClick={handleUndo}
                  disabled={historyIndex === 0}
                  className={styles.undoRedoButton}
                  aria-label="Undo"
                  title="Undo"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className={styles.undoRedoButton}
                  aria-label="Redo"
                  title="Redo"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <div className={styles.headerRight}>
            <UserMenu />
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

