'use client'

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react'
import { useSession, getSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import DrawingCanvas from '@/components/DrawingCanvas'
import ColorPicker from '@/components/ColorPicker'
import CompactColorPicker from '@/components/CompactColorPicker'
import ColorPalette from '@/components/ColorPalette'
import Controls from '@/components/Controls'
import MobileMenu from '@/components/MobileMenu'
import LayersPanel from '@/components/LayersPanel'
import LayersDrawer from '@/components/LayersDrawer'
import { encodeDrawing, decodeDrawing } from '@/lib/serialization'
import { floodFillGrid } from '@/lib/floodFill'
import { copySelectionCells, clearRectFromGrid, pasteClipboardToGrid } from '@/lib/selection'
import { compositeLayers, createLayer, createDefaultLayers, clampActiveLayerIndex, normalizeDrawingData } from '@/lib/layers'
import type { DrawingData, MatrixPattern, Tool, SelectionRect, ClipboardData, Layer, HistoryEntry } from '@/lib/types'
import { TRANSPARENT } from '@/lib/types'
import UserMenu from '@/components/UserMenu'
import { useToast } from '@/components/ToastProvider'
import styles from './page.module.css'

// Re-export types for backward compatibility
export type { MatrixPattern, DrawingData } from '@/lib/types'

// Bounds the undo stack's total memory footprint (roughly this many grid
// cells, summed across all retained snapshots and all layers) instead of a
// flat entry count. A flat cap of 50 doesn't scale down for large canvases
// (or many layers) - 50 full snapshots of a 500x500 canvas is tens of
// millions of retained cell entries, enough to exhaust a tab's memory during
// a long drawing session.
const HISTORY_CELL_BUDGET = 2_000_000
function getMaxHistoryEntries(canvasWidth: number, canvasHeight: number, layerCount: number): number {
  const cells = canvasWidth * canvasHeight * Math.max(1, layerCount)
  // Floor of 1 (not a larger minimum) so the budget stays meaningful for
  // large/multi-layer canvases - a fully painted 500x500 canvas with 10
  // layers is 2.5M cells per snapshot alone, so even a floor of 10 entries
  // would blow far past HISTORY_CELL_BUDGET regardless of this cap.
  return Math.max(1, Math.min(50, Math.floor(HISTORY_CELL_BUDGET / Math.max(1, cells))))
}

// A drawing shared as a URL becomes unwieldy (and risks silent truncation by
// chat apps, SMS, older proxies, etc.) past roughly this many characters.
const SAFE_SHARE_URL_LENGTH = 2000

// Prisma's default cuid() ids are alphanumeric; this is intentionally a bit
// more permissive (covers uuid/nanoid too) while still rejecting anything
// that could act as a path segment other than a plain opaque id - notably
// '/', '.', and whitespace. The `?id=` query param is attacker-controlled
// (an attacker can craft and share a link), and it's interpolated directly
// into `/api/drawings/${id}` fetch URLs, so an unvalidated value like
// `../../auth/signout` would resolve (browsers normalize '..' in fetch
// URLs) to a request against a completely different same-origin endpoint.
const DRAWING_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
function isValidDrawingId(id: string): boolean {
  return DRAWING_ID_PATTERN.test(id)
}

function HomeContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const [selectedColor, setSelectedColor] = useState('#000000')
  const [savedColors, setSavedColors] = useState<string[]>([])
  const [pattern, setPattern] = useState<MatrixPattern>('squares')
  const [pixelSize, setPixelSize] = useState(15)
  const [canvasWidth, setCanvasWidth] = useState(20)
  const [canvasHeight, setCanvasHeight] = useState(20)
  const [tempCanvasWidth, setTempCanvasWidth] = useState('20')
  const [tempCanvasHeight, setTempCanvasHeight] = useState('20')
  const [layers, setLayers] = useState<Layer[]>(() => createDefaultLayers())
  const layersRef = useRef<Layer[]>(layers)
  const [activeLayerIndex, setActiveLayerIndex] = useState(0)
  const activeLayerIndexRef = useRef(0)
  // Tracks which ?id= drawing has already been loaded this mount, so a
  // session refetch (periodic or on window focus) doesn't re-trigger the
  // load effect and clobber in-progress edits with the original saved data.
  const loadedDrawingIdRef = useRef<string | null>(null)
  const [tool, setTool] = useState<Tool>('draw')
  // Tool to restore once the color picker has been used - the picker is
  // momentary, unlike fill/draw which stay selected until changed.
  const previousToolRef = useRef<Tool>('draw')
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null)
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingCopy, setIsSavingCopy] = useState(false)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [showNewDrawingModal, setShowNewDrawingModal] = useState(false)

  // Undo/Redo history - each entry is a full snapshot of the layer stack
  // plus which layer was active at that point (see HistoryEntry).
  const [history, setHistory] = useState<HistoryEntry[]>([{ layers, activeLayerIndex: 0 }])
  const [historyIndex, setHistoryIndex] = useState(0)
  const isUndoRedoRef = useRef(false)
  const historyRef = useRef<HistoryEntry[]>([{ layers, activeLayerIndex: 0 }])
  const historyIndexRef = useRef(0)
  const lastSavedLayersRef = useRef<Layer[]>(layers)
  const historyDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const localStorageDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const canvasDimsRef = useRef({ width: canvasWidth, height: canvasHeight })

  // The flattened view of all visible layers - what's actually drawn on the
  // canvas and what export/preview render.
  const compositeGrid = useMemo(() => compositeLayers(layers), [layers])
  const activeLayer = layers[activeLayerIndex] ?? layers[0]

  // Keep refs in sync with state
  useEffect(() => {
    layersRef.current = layers
  }, [layers])

  useEffect(() => {
    activeLayerIndexRef.current = activeLayerIndex
  }, [activeLayerIndex])

  // Keep canvas dimensions ref in sync (read by the debounced history savers,
  // which are stable useCallbacks and would otherwise close over stale sizes)
  useEffect(() => {
    canvasDimsRef.current = { width: canvasWidth, height: canvasHeight }
  }, [canvasWidth, canvasHeight])

  useEffect(() => {
    historyRef.current = history
  }, [history])

  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])

  // Pushes a new history entry from the current refs, synchronously. Reads
  // and writes historyRef/historyIndexRef/lastSavedLayersRef directly rather
  // than going through a setHistory((hist) => ...) functional updater: React
  // Strict Mode double-invokes functional updaters in dev, and since this
  // logic both reads and mutates refs as a side effect, a double-invocation
  // would push two (sometimes divergent) entries for a single logical edit,
  // corrupting undo/redo. Computing the next array as a plain value and
  // calling setHistory(newHistory) sidesteps that entirely.
  const commitHistoryEntry = () => {
    const currentLayers = layersRef.current
    const currentIdx = historyIndexRef.current
    const newHistory = historyRef.current.slice(0, currentIdx + 1)
    newHistory.push({ layers: currentLayers, activeLayerIndex: activeLayerIndexRef.current })
    const maxEntries = getMaxHistoryEntries(canvasDimsRef.current.width, canvasDimsRef.current.height, currentLayers.length)
    if (newHistory.length > maxEntries) {
      newHistory.shift()
    }
    historyRef.current = newHistory
    const newIdx = newHistory.length - 1
    historyIndexRef.current = newIdx
    lastSavedLayersRef.current = currentLayers
    setHistory(newHistory)
    setHistoryIndex(newIdx)
  }

  // Function to save current layers to history (debounced).
  // The "did it change" check itself is deferred into the timeout (rather
  // than run eagerly on every call) since JSON.stringify-ing the whole layer
  // stack is wasted work if the user paints several more pixels before the
  // debounce window elapses anyway - this keeps that cost to at most once
  // per 500ms of inactivity instead of once per pixel painted.
  const saveToHistory = useCallback(() => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current)
    }

    historyDebounceTimerRef.current = setTimeout(() => {
      historyDebounceTimerRef.current = null
      if (isUndoRedoRef.current) return

      const currentStr = JSON.stringify(layersRef.current)
      const lastSavedStr = JSON.stringify(lastSavedLayersRef.current)
      if (currentStr === lastSavedStr) {
        return // No change, don't save
      }

      commitHistoryEntry()
    }, 500)
  }, [])

  // Save current layers to history immediately (bypass debounce)
  const saveToHistoryImmediate = useCallback(() => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current)
      historyDebounceTimerRef.current = null
    }

    const currentStr = JSON.stringify(layersRef.current)
    const lastSavedStr = JSON.stringify(lastSavedLayersRef.current)
    if (currentStr === lastSavedStr) {
      return // No change, don't save
    }

    if (!isUndoRedoRef.current) {
      commitHistoryEntry()
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

  // Applies a loaded/decoded DrawingData into state - shared by the
  // localStorage, URL-share, and saved-drawing load effects below.
  const applyLoadedDrawing = (data: DrawingData) => {
    setPattern(data.pattern)
    setPixelSize(data.pixelSize)
    setCanvasWidth(data.canvasWidth)
    setCanvasHeight(data.canvasHeight)
    setTempCanvasWidth(data.canvasWidth.toString())
    setTempCanvasHeight(data.canvasHeight.toString())
    setSavedColors(Object.values(data.colors || {}))
    setLayers(data.layers)
    layersRef.current = data.layers
    setActiveLayerIndex(data.activeLayerIndex)
    activeLayerIndexRef.current = data.activeLayerIndex
    setSelection(null)
    setClipboard(null)
    const initialHistory = [{ layers: data.layers, activeLayerIndex: data.activeLayerIndex }]
    setHistory(initialHistory)
    historyRef.current = initialHistory
    setHistoryIndex(0)
    historyIndexRef.current = 0
    lastSavedLayersRef.current = data.layers
  }

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('pattern-draw-data')
    if (saved) {
      try {
        applyLoadedDrawing(normalizeDrawingData(JSON.parse(saved)))
      } catch (e) {
        console.error('Failed to load from localStorage', e)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load from URL if present (for sharing)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const encoded = params.get('drawing')
      if (encoded) {
        const loadFromUrl = async () => {
          try {
            const data = await decodeDrawing(encoded)
            if (data) {
              applyLoadedDrawing(data)
            }
          } catch (e) {
            console.error('Failed to load from URL', e)
          }
        }
        loadFromUrl()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load from saved drawing ID if present.
  // NextAuth's SessionProvider refetches the session periodically and on
  // window focus (see components/SessionProvider.tsx), producing a new
  // `session` object each time even when nothing meaningful changed. Since
  // that object is a dependency here, this effect would otherwise re-run and
  // re-fetch/overwrite the in-progress drawing with the original saved data
  // - wiping out everything drawn since the page loaded. Guard with a ref so
  // a given drawing ID is only loaded once per mount, while still reacting
  // to the session actually becoming available or the id actually changing.
  useEffect(() => {
    const drawingId = searchParams.get('id')
    if (drawingId && !isValidDrawingId(drawingId)) {
      console.error('Ignoring malformed ?id= drawing parameter')
      router.replace(window.location.pathname)
      return
    }
    if (drawingId && session?.user?.id && loadedDrawingIdRef.current !== drawingId) {
      loadedDrawingIdRef.current = drawingId
      const loadDrawing = async () => {
        try {
          const response = await fetch(`/api/drawings/${drawingId}`)
          if (response.ok) {
            const { drawingData } = await response.json()
            if (drawingData) {
              applyLoadedDrawing(normalizeDrawingData(drawingData))
              setCurrentDrawingId(drawingId)
            } else {
              loadedDrawingIdRef.current = null
            }
          } else {
            loadedDrawingIdRef.current = null
          }
        } catch (e) {
          console.error('Failed to load drawing', e)
          loadedDrawingIdRef.current = null
        }
      }
      loadDrawing()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session])

  const buildDrawingData = useCallback((): DrawingData => ({
    pattern,
    pixelSize,
    canvasWidth,
    canvasHeight,
    colors: savedColors.reduce((acc, color, idx) => {
      acc[idx.toString()] = color
      return acc
    }, {} as { [key: string]: string }),
    layers,
    activeLayerIndex,
  }), [pattern, pixelSize, canvasWidth, canvasHeight, savedColors, layers, activeLayerIndex])

  // Save function that can be called manually - memoized with useCallback
  const saveToLocalStorage = useCallback(() => {
    try {
      localStorage.setItem('pattern-draw-data', JSON.stringify(buildDrawingData()))
    } catch (e) {
      console.error('Failed to save to localStorage', e)
    }
  }, [buildDrawingData])

  // Save to local storage whenever data changes (debounced - writing/serializing
  // the whole drawing on every single pixel painted during a fast drag is
  // wasted, main-thread-blocking work; the visibility/pagehide/beforeunload
  // handlers below flush immediately so nothing is lost when the user leaves)
  useEffect(() => {
    if (localStorageDebounceTimerRef.current) {
      clearTimeout(localStorageDebounceTimerRef.current)
    }
    localStorageDebounceTimerRef.current = setTimeout(() => {
      localStorageDebounceTimerRef.current = null
      saveToLocalStorage()
    }, 500)
    return () => {
      if (localStorageDebounceTimerRef.current) {
        clearTimeout(localStorageDebounceTimerRef.current)
      }
    }
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

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

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

  const handleColorPickerModeToggle = (enabled: boolean) => {
    if (enabled) {
      if (tool !== 'colorPicker') {
        previousToolRef.current = tool
      }
      setTool('colorPicker')
    } else {
      setTool(previousToolRef.current)
    }
  }

  const handleDrawModeSelect = () => {
    setTool('draw')
  }

  const handleFillModeToggle = (enabled: boolean) => {
    setTool(enabled ? 'fill' : 'draw')
  }

  const handleSelectModeToggle = (enabled: boolean) => {
    setTool(enabled ? 'select' : 'draw')
  }

  const handleSelectionChange = useCallback((rect: SelectionRect | null) => {
    setSelection(rect)
  }, [])

  // Applies `updater` to the active layer's grid. `onApplied`, if given, runs
  // synchronously right after layersRef is updated - inside the same setState
  // updater, since React doesn't invoke a functional setState updater
  // synchronously at the call site. Calling e.g. saveToHistoryImmediate()
  // right after updateActiveLayerGrid(...) returns (rather than passing it
  // as onApplied) would race the update: layersRef.current would still hold
  // the pre-update snapshot when the history save reads it.
  const updateActiveLayerGrid = useCallback((
    updater: (grid: { [key: string]: string }) => { [key: string]: string },
    onApplied?: () => void
  ) => {
    const idx = activeLayerIndexRef.current
    const targetLayer = layersRef.current[idx]
    if (!targetLayer) return
    const newGrid = updater(targetLayer.grid)
    const newLayers = layersRef.current.map((l, i) => (i === idx ? { ...l, grid: newGrid } : l))
    layersRef.current = newLayers
    setLayers(newLayers)
    onApplied?.()
  }, [])

  const handleSelectionMoveEnd = useCallback((deltaRow: number, deltaCol: number) => {
    if (!selection) return
    const newRect: SelectionRect = {
      startRow: selection.startRow + deltaRow,
      startCol: selection.startCol + deltaCol,
      endRow: selection.endRow + deltaRow,
      endCol: selection.endCol + deltaCol,
    }
    updateActiveLayerGrid((prev) => {
      const clip = copySelectionCells(prev, selection)
      let newGrid = clearRectFromGrid(prev, selection)
      newGrid = pasteClipboardToGrid(newGrid, clip, newRect.startRow, newRect.startCol, canvasWidth, canvasHeight)
      return newGrid
    }, saveToHistoryImmediate)
    setSelection(newRect)
  }, [selection, canvasWidth, canvasHeight, saveToHistoryImmediate, updateActiveLayerGrid])

  const handleCopy = useCallback(() => {
    if (!selection) return
    const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
    setClipboard(copySelectionCells(activeGrid, selection))
  }, [selection])

  const handleCut = useCallback(() => {
    if (!selection) return
    const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
    setClipboard(copySelectionCells(activeGrid, selection))
    updateActiveLayerGrid((prev) => clearRectFromGrid(prev, selection), saveToHistoryImmediate)
  }, [selection, saveToHistoryImmediate, updateActiveLayerGrid])

  const handlePaste = useCallback(() => {
    if (!clipboard) return
    const targetRow = selection ? selection.startRow : 0
    const targetCol = selection ? selection.startCol : 0
    updateActiveLayerGrid((prev) => pasteClipboardToGrid(prev, clipboard, targetRow, targetCol, canvasWidth, canvasHeight), saveToHistoryImmediate)
    setTool('select')
    setSelection({
      startRow: targetRow,
      startCol: targetCol,
      endRow: Math.min(targetRow + clipboard.height - 1, canvasHeight - 1),
      endCol: Math.min(targetCol + clipboard.width - 1, canvasWidth - 1),
    })
  }, [clipboard, selection, canvasWidth, canvasHeight, saveToHistoryImmediate, updateActiveLayerGrid])

  const handleDeleteSelection = useCallback(() => {
    if (!selection) return
    updateActiveLayerGrid((prev) => clearRectFromGrid(prev, selection), saveToHistoryImmediate)
  }, [selection, saveToHistoryImmediate, updateActiveLayerGrid])

  const handleDeselect = useCallback(() => {
    setSelection(null)
  }, [])

  // Keyboard shortcuts: tool switching (P/F/C/S) and select-tool actions
  // (copy/cut/paste/delete/deselect). Ignored while typing in a text input
  // so hex-color and canvas-size fields keep working.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditable = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isEditable) return

      const isMeta = e.metaKey || e.ctrlKey
      const noModifiers = !e.metaKey && !e.ctrlKey && !e.altKey
      const key = e.key.toLowerCase()

      if (isMeta && key === 'c') {
        if (tool === 'select' && selection) {
          e.preventDefault()
          handleCopy()
        }
      } else if (isMeta && key === 'x') {
        if (tool === 'select' && selection) {
          e.preventDefault()
          handleCut()
        }
      } else if (isMeta && key === 'v') {
        if (clipboard) {
          e.preventDefault()
          handlePaste()
        }
      } else if (e.key === 'Escape') {
        if (selection) {
          e.preventDefault()
          handleDeselect()
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select' && selection) {
        e.preventDefault()
        handleDeleteSelection()
      } else if (noModifiers && key === 'p') {
        e.preventDefault()
        handleDrawModeSelect()
      } else if (noModifiers && key === 'f') {
        e.preventDefault()
        handleFillModeToggle(tool !== 'fill')
      } else if (noModifiers && key === 'c') {
        e.preventDefault()
        handleColorPickerModeToggle(tool !== 'colorPicker')
      } else if (noModifiers && key === 's') {
        e.preventDefault()
        handleSelectModeToggle(tool !== 'select')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tool, selection, clipboard, handleCopy, handleCut, handlePaste, handleDeselect, handleDeleteSelection, handleDrawModeSelect, handleFillModeToggle, handleColorPickerModeToggle, handleSelectModeToggle])

  const handlePixelFill = (key: string, color: string) => {
    if (tool === 'colorPicker') {
      // Pick the color as it's visually shown (composited across all visible
      // layers), then return to whichever tool was active before.
      const pixelColor = compositeGrid[key] || '#ffffff'
      setSelectedColor(pixelColor)
      handleColorSave(pixelColor)
      setTool(previousToolRef.current)
    } else if (tool === 'fill') {
      const [rowStr, colStr] = key.split(',')
      const row = parseInt(rowStr, 10)
      const col = parseInt(colStr, 10)
      const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
      const targetColor = activeGrid[key] || TRANSPARENT
      if (targetColor === color) return

      updateActiveLayerGrid(
        (prev) => floodFillGrid(prev, row, col, targetColor, color, canvasWidth, canvasHeight),
        () => { if (!isUndoRedoRef.current) saveToHistory() }
      )
    } else {
      updateActiveLayerGrid(
        (prev) => ({ ...prev, [key]: color }),
        () => { if (!isUndoRedoRef.current) saveToHistory() }
      )
    }
  }

  const handleUndo = () => {
    saveToHistoryImmediate()

    setTimeout(() => {
      const currentIdx = historyIndexRef.current
      const currentHistory = historyRef.current
      if (currentIdx > 0) {
        isUndoRedoRef.current = true
        const newIndex = currentIdx - 1
        const entry = currentHistory[newIndex]
        setHistoryIndex(newIndex)
        historyIndexRef.current = newIndex
        setLayers(entry.layers)
        layersRef.current = entry.layers
        lastSavedLayersRef.current = entry.layers
        // Restore whichever layer was active at this point in history, not
        // wherever the (now possibly-reordered/deleted) currently-active
        // index happens to land - see HistoryEntry.
        const restoredActive = clampActiveLayerIndex(entry.activeLayerIndex, entry.layers.length)
        setActiveLayerIndex(restoredActive)
        activeLayerIndexRef.current = restoredActive
        setSelection(null)
        setTimeout(() => {
          isUndoRedoRef.current = false
        }, 0)
      }
    }, 10)
  }

  const handleRedo = () => {
    saveToHistoryImmediate()

    setTimeout(() => {
      const currentIdx = historyIndexRef.current
      const currentHistory = historyRef.current
      if (currentIdx < currentHistory.length - 1) {
        isUndoRedoRef.current = true
        const newIndex = currentIdx + 1
        const entry = currentHistory[newIndex]
        setHistoryIndex(newIndex)
        historyIndexRef.current = newIndex
        setLayers(entry.layers)
        layersRef.current = entry.layers
        lastSavedLayersRef.current = entry.layers
        const restoredActive = clampActiveLayerIndex(entry.activeLayerIndex, entry.layers.length)
        setActiveLayerIndex(restoredActive)
        activeLayerIndexRef.current = restoredActive
        setSelection(null)
        setTimeout(() => {
          isUndoRedoRef.current = false
        }, 0)
      }
    }, 10)
  }

  const handleClear = () => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current)
      historyDebounceTimerRef.current = null
    }

    const emptyLayers = createDefaultLayers()
    setLayers(emptyLayers)
    layersRef.current = emptyLayers
    setActiveLayerIndex(0)
    activeLayerIndexRef.current = 0
    setSelection(null)
    setClipboard(null)
    // Reset currentDrawingId so future saves create a new drawing instead of updating
    setCurrentDrawingId(null)
    // Clear the URL parameter if present
    if (searchParams.get('id')) {
      router.replace(window.location.pathname)
    }
    // Add clear to history immediately (not debounced)
    const maxHistoryEntries = getMaxHistoryEntries(canvasWidth, canvasHeight, emptyLayers.length)
    setHistory((hist) => {
      const currentIdx = historyIndexRef.current
      const newHistory = hist.slice(0, currentIdx + 1)
      newHistory.push({ layers: emptyLayers, activeLayerIndex: 0 })
      if (newHistory.length > maxHistoryEntries) {
        newHistory.shift()
      }
      const updatedHistory = newHistory
      historyRef.current = updatedHistory
      const newIdx = updatedHistory.length - 1
      setHistoryIndex(newIdx)
      historyIndexRef.current = newIdx
      lastSavedLayersRef.current = emptyLayers
      return updatedHistory
    })
  }

  const handleNewDrawingCopy = () => {
    setShowNewDrawingModal(false)
    setCurrentDrawingId(null)
    if (searchParams.get('id')) {
      router.replace(window.location.pathname)
    }
  }

  const handleNewDrawingRequest = () => {
    setShowNewDrawingModal(true)
  }

  const handleNewDrawingBlank = () => {
    setShowNewDrawingModal(false)
    handleClear()
  }

  const handleSetCanvasSize = () => {
    const width = parseInt(tempCanvasWidth)
    const height = parseInt(tempCanvasHeight)
    const widthValid = !isNaN(width) && width >= 2 && width <= 500
    const heightValid = !isNaN(height) && height >= 2 && height <= 500
    const newWidth = widthValid ? width : canvasWidth
    const newHeight = heightValid ? height : canvasHeight

    if (widthValid) {
      setCanvasWidth(newWidth)
    } else {
      setTempCanvasWidth(canvasWidth.toString())
    }
    if (heightValid) {
      setCanvasHeight(newHeight)
    } else {
      setTempCanvasHeight(canvasHeight.toString())
    }

    if (newWidth !== canvasWidth || newHeight !== canvasHeight) {
      // Shift existing pixels so the drawing stays centered instead of
      // new rows/columns only being added on the right/bottom.
      const colOffset = Math.floor((newWidth - canvasWidth) / 2)
      const rowOffset = Math.floor((newHeight - canvasHeight) / 2)

      const shiftedLayers = layersRef.current.map((layer) => {
        const shiftedGrid: { [key: string]: string } = {}
        for (const key in layer.grid) {
          const [rowStr, colStr] = key.split(',')
          const newRow = parseInt(rowStr, 10) + rowOffset
          const newCol = parseInt(colStr, 10) + colOffset
          if (newRow >= 0 && newRow < newHeight && newCol >= 0 && newCol < newWidth) {
            shiftedGrid[`${newRow},${newCol}`] = layer.grid[key]
          }
        }
        return { ...layer, grid: shiftedGrid }
      })

      setLayers(shiftedLayers)
      layersRef.current = shiftedLayers
      setSelection(null)
      saveToHistoryImmediate()
    }
  }

  const copyOrPromptUrl = (url: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard!', 'success')
      })
    } else {
      prompt('Copy this link:', url)
    }
  }

  const handleShare = async () => {
    // Prefer a short, stable ?id= link whenever the drawing is already
    // persisted - the embedded-data link below grows with every layer and
    // painted pixel, and can run into practical URL-length limits.
    if (currentDrawingId) {
      // Push the current in-memory state first - otherwise a share right
      // after unsaved edits (autosave only covers localStorage, not the
      // server record) would hand out a link to the stale last-saved version.
      try {
        const response = await fetch(`/api/drawings/${currentDrawingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingData: buildDrawingData() }),
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error('Failed to sync latest changes')
        }
      } catch (e) {
        console.error('Failed to sync latest changes before sharing', e)
        showToast('Could not sync your latest changes - the shared link may be out of date.', 'error')
      }
      copyOrPromptUrl(`${window.location.origin}${window.location.pathname}?id=${currentDrawingId}`)
      return
    }

    if (session?.user?.id) {
      try {
        const response = await fetch('/api/drawings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingData: buildDrawingData() }),
          credentials: 'include',
        })
        if (response.ok) {
          const { drawing } = await response.json()
          setCurrentDrawingId(drawing.id)
          loadedDrawingIdRef.current = drawing.id
          router.replace(`${window.location.pathname}?id=${drawing.id}`)
          copyOrPromptUrl(`${window.location.origin}${window.location.pathname}?id=${drawing.id}`)
          return
        }
      } catch (e) {
        console.error('Failed to save drawing before sharing, falling back to an embedded-data link', e)
      }
    }

    const encoded = await encodeDrawing(buildDrawingData())
    const url = `${window.location.origin}${window.location.pathname}?drawing=${encoded}`

    if (url.length > SAFE_SHARE_URL_LENGTH) {
      showToast(
        session?.user?.id
          ? 'This drawing is too large to share as a link.'
          : 'This drawing is too large to share as a link. Sign in to share it instead.',
        'error'
      )
      return
    }

    copyOrPromptUrl(url)
  }

  const handleDownload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cols = canvasWidth
    const rows = canvasHeight

    const widthOffset = pattern === 'bricks' ? pixelSize / 2 : 0
    const heightOffset = pattern === 'bricksVertical' ? pixelSize / 2 : 0
    canvas.width = cols * pixelSize + widthOffset
    canvas.height = rows * pixelSize + heightOffset

    // Fill background (the "paper" the layers sit on)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1

    // Flatten all visible layers into a single composite before rendering -
    // this is the "merge to a single layer" export behavior.
    const flatGrid = compositeLayers(layers)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${row},${col}`
        const color = flatGrid[key] || '#ffffff'

        let x = col * pixelSize
        let y = row * pixelSize

        if (pattern === 'bricks' && row % 2 === 1) {
          x += pixelSize / 2
        } else if (pattern === 'bricksVertical' && col % 2 === 1) {
          y += pixelSize / 2
        }

        ctx.fillStyle = color
        ctx.fillRect(x, y, pixelSize, pixelSize)
        ctx.strokeRect(x, y, pixelSize, pixelSize)
      }
    }

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

  const handleSave = async () => {
    if (!session?.user?.id) {
      showToast('Please sign in to save drawings', 'error')
      router.push('/auth/signin')
      return
    }

    setIsSaving(true)
    try {
      const drawingData = buildDrawingData()

      const body = JSON.stringify({ drawingData })
      const headers = { 'Content-Type': 'application/json' as const }
      const credentials = 'include' as RequestCredentials

      let response: Response
      if (currentDrawingId) {
        response = await fetch(`/api/drawings/${currentDrawingId}`, {
          method: 'PUT',
          headers,
          body,
          credentials,
        })
      } else {
        response = await fetch('/api/drawings', {
          method: 'POST',
          headers,
          body,
          credentials,
        })
      }

      if (response.status === 401) {
        const freshSession = await getSession()
        if (!freshSession?.user?.id) {
          await signOut({ redirect: false })
          router.push('/auth/signin?error=SessionExpired&callbackUrl=' + encodeURIComponent(window.location.pathname + window.location.search))
          return
        }
        throw new Error('Session expired. Please try saving again.')
      }

      if (response.ok) {
        if (currentDrawingId) {
          showToast('Drawing updated!', 'success')
        } else {
          const { drawing } = await response.json()
          setCurrentDrawingId(drawing.id)
          showToast('Drawing saved!', 'success')
        }
      } else {
        throw new Error('Failed to save drawing')
      }
    } catch (error) {
      console.error('Error saving drawing:', error)
      const message = error instanceof Error ? error.message : 'Failed to save drawing. Please try again.'
      showToast(message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAsCopy = async () => {
    if (!session?.user?.id) {
      showToast('Please sign in to save drawings', 'error')
      router.push('/auth/signin')
      return
    }

    setIsSavingCopy(true)
    try {
      const drawingData = buildDrawingData()

      const response = await fetch('/api/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawingData }),
        credentials: 'include',
      })

      if (response.status === 401) {
        const freshSession = await getSession()
        if (!freshSession?.user?.id) {
          await signOut({ redirect: false })
          router.push('/auth/signin?error=SessionExpired&callbackUrl=' + encodeURIComponent(window.location.pathname + window.location.search))
          return
        }
        throw new Error('Session expired. Please try saving again.')
      }

      if (response.ok) {
        const { drawing } = await response.json()
        setCurrentDrawingId(drawing.id)
        // Mark this id as already loaded so the ?id= load effect doesn't
        // refetch it and reset the undo history now that the URL changes.
        loadedDrawingIdRef.current = drawing.id
        router.replace(`${window.location.pathname}?id=${drawing.id}`)
        showToast('Copy saved', 'success')
      } else {
        throw new Error('Failed to save drawing copy')
      }
    } catch (error) {
      console.error('Error saving drawing copy:', error)
      const message = error instanceof Error ? error.message : 'Failed to save drawing copy. Please try again.'
      showToast(message, 'error')
    } finally {
      setIsSavingCopy(false)
    }
  }

  // --- Layer management ---

  // All of the handlers below compute the next layers array synchronously
  // from layersRef.current and call setLayers(newLayers) with a plain value,
  // rather than setLayers((prev) => {...}) with side effects inside. A
  // functional updater gets double-invoked by React Strict Mode in dev, and
  // since these updates carry side effects (ref writes, nested setState
  // calls like saveToHistoryImmediate), double-invoking them would corrupt
  // history with duplicate/divergent entries. Reading layersRef.current
  // directly is safe here since it's always kept in sync synchronously.

  const handleAddLayer = useCallback(() => {
    const newIndex = layersRef.current.length
    const newLayer = createLayer(`Layer ${newIndex + 1}`)
    const newLayers = [...layersRef.current, newLayer]
    layersRef.current = newLayers
    setLayers(newLayers)
    setActiveLayerIndex(newIndex)
    activeLayerIndexRef.current = newIndex
    setSelection(null)
    saveToHistoryImmediate()
  }, [saveToHistoryImmediate])

  const handleDeleteLayer = useCallback((id: string) => {
    const prev = layersRef.current
    if (prev.length <= 1) return
    const deleteIndex = prev.findIndex((l) => l.id === id)
    if (deleteIndex === -1) return
    const newLayers = prev.filter((l) => l.id !== id)
    layersRef.current = newLayers
    setLayers(newLayers)

    const currentActive = activeLayerIndexRef.current
    let newActive = currentActive
    if (deleteIndex === currentActive) {
      newActive = Math.max(0, deleteIndex - 1)
    } else if (deleteIndex < currentActive) {
      newActive = currentActive - 1
    }
    newActive = clampActiveLayerIndex(newActive, newLayers.length)
    setActiveLayerIndex(newActive)
    activeLayerIndexRef.current = newActive

    setSelection(null)
    saveToHistoryImmediate()
  }, [saveToHistoryImmediate])

  const handleRenameLayer = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const newLayers = layersRef.current.map((l) => (l.id === id ? { ...l, name: trimmed } : l))
    layersRef.current = newLayers
    setLayers(newLayers)
    saveToHistoryImmediate()
  }, [saveToHistoryImmediate])

  const handleToggleLayerVisibility = useCallback((id: string) => {
    const newLayers = layersRef.current.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    layersRef.current = newLayers
    setLayers(newLayers)
    saveToHistoryImmediate()
  }, [saveToHistoryImmediate])

  const handleSetActiveLayer = useCallback((id: string) => {
    const index = layersRef.current.findIndex((l) => l.id === id)
    if (index === -1) return
    setActiveLayerIndex(index)
    activeLayerIndexRef.current = index
    setSelection(null)
  }, [])

  // direction: 'up' moves the layer toward the top of the stack (higher
  // array index); 'down' moves it toward the bottom.
  const handleMoveLayer = useCallback((id: string, direction: 'up' | 'down') => {
    const prev = layersRef.current
    const index = prev.findIndex((l) => l.id === id)
    if (index === -1) return
    const targetIndex = direction === 'up' ? index + 1 : index - 1
    if (targetIndex < 0 || targetIndex >= prev.length) return

    const newLayers = [...prev]
    ;[newLayers[index], newLayers[targetIndex]] = [newLayers[targetIndex], newLayers[index]]
    layersRef.current = newLayers
    setLayers(newLayers)

    if (activeLayerIndexRef.current === index) {
      setActiveLayerIndex(targetIndex)
      activeLayerIndexRef.current = targetIndex
    } else if (activeLayerIndexRef.current === targetIndex) {
      setActiveLayerIndex(index)
      activeLayerIndexRef.current = index
    }

    saveToHistoryImmediate()
  }, [saveToHistoryImmediate])

  const handleMergeLayerDown = useCallback((id: string) => {
    const prev = layersRef.current
    const index = prev.findIndex((l) => l.id === id)
    if (index <= 0) return
    const source = prev[index]
    if (!source.visible) return
    const target = prev[index - 1]

    const mergedGrid = { ...target.grid }
    for (const key in source.grid) {
      const color = source.grid[key]
      if (color) mergedGrid[key] = color
    }

    const newLayers = prev
      .filter((_, i) => i !== index)
      .map((l) => (l.id === target.id ? { ...target, grid: mergedGrid } : l))
    layersRef.current = newLayers
    setLayers(newLayers)

    const prevActive = activeLayerIndexRef.current
    const newActive = clampActiveLayerIndex(
      prevActive === index ? index - 1 : prevActive > index ? prevActive - 1 : prevActive,
      newLayers.length
    )
    setActiveLayerIndex(newActive)
    activeLayerIndexRef.current = newActive

    setSelection(null)
    saveToHistoryImmediate()
  }, [saveToHistoryImmediate])

  const layersPanelProps = {
    layers,
    activeLayerId: activeLayer?.id || '',
    onSelectLayer: handleSetActiveLayer,
    onAddLayer: handleAddLayer,
    onDeleteLayer: handleDeleteLayer,
    onRenameLayer: handleRenameLayer,
    onToggleVisibility: handleToggleLayerVisibility,
    onMoveLayer: handleMoveLayer,
    onMergeDown: handleMergeLayerDown,
  }

  return (
    <main className={styles.main}>
      {showNewDrawingModal && (
        <div className={styles.modalOverlay} onClick={() => setShowNewDrawingModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>New drawing</h3>
            <p className={styles.modalMessage}>Start from a blank canvas or copy the current drawing?</p>
            <div className={styles.modalActions}>
              <button onClick={handleNewDrawingBlank} className={styles.modalButton}>
                Start blank
              </button>
              <button onClick={handleNewDrawingCopy} className={styles.modalButton}>
                Copy current drawing
              </button>
            </div>
            <button onClick={() => setShowNewDrawingModal(false)} className={styles.modalCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className={`${styles.container} ${isPanelCollapsed ? styles.panelCollapsed : ''}`}>
        <div className={styles.leftSection}>
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
              <LayersDrawer {...layersPanelProps} />
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
                onNewDrawingRequest={handleNewDrawingRequest}
                onShare={handleShare}
                onDownload={handleDownload}
                onSave={handleSave}
                isSaving={isSaving}
                onSaveAsCopy={handleSaveAsCopy}
                isSavingCopy={isSavingCopy}
                onPrint={() => { }}
              />
            </div>
          </div>

          <div className={styles.topBar}>
            <div className={styles.colorTools}>
              <CompactColorPicker
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
                onColorSave={handleColorSave}
                isDrawMode={tool === 'draw'}
                onDrawModeSelect={handleDrawModeSelect}
                isColorPickerMode={tool === 'colorPicker'}
                onColorPickerModeToggle={handleColorPickerModeToggle}
                isFillMode={tool === 'fill'}
                onFillModeToggle={handleFillModeToggle}
                isSelectMode={tool === 'select'}
                onSelectModeToggle={handleSelectModeToggle}
                canCopy={tool === 'select' && !!selection}
                canPaste={!!clipboard}
                onCopy={handleCopy}
                onCut={handleCut}
                onPaste={handlePaste}
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
            <div className={styles.scrollableCanvasWrapper}>
              <DrawingCanvas
                pattern={pattern}
                pixelSize={pixelSize}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                selectedColor={selectedColor}
                grid={compositeGrid}
                activeLayerGrid={activeLayer?.grid || {}}
                onPixelFill={handlePixelFill}
                tool={tool}
                selection={selection}
                onSelectionChange={handleSelectionChange}
                onSelectionMoveEnd={handleSelectionMoveEnd}
              />
            </div>
          </div>
        </div>

        {/* Desktop tools panel - hidden on mobile */}
        <div className={`${styles.toolsPanel} ${isPanelCollapsed ? styles.collapsed : ''}`}>
          <div className={styles.panelContent}>
            <div className={styles.panelSection}>
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
                onNewDrawingRequest={handleNewDrawingRequest}
                onShare={handleShare}
                onDownload={handleDownload}
                onSave={handleSave}
                isSaving={isSaving}
                onSaveAsCopy={handleSaveAsCopy}
                isSavingCopy={isSavingCopy}
                onPrint={() => { }}
              />
            </div>
            <div className={styles.panelSection}>
              <LayersPanel {...layersPanelProps} />
            </div>
            <div className={styles.panelSection}>
              <ColorPicker
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
                onColorSave={handleColorSave}
                isDrawMode={tool === 'draw'}
                onDrawModeSelect={handleDrawModeSelect}
                isColorPickerMode={tool === 'colorPicker'}
                onColorPickerModeToggle={handleColorPickerModeToggle}
                isFillMode={tool === 'fill'}
                onFillModeToggle={handleFillModeToggle}
                isSelectMode={tool === 'select'}
                onSelectModeToggle={handleSelectModeToggle}
                canCopy={tool === 'select' && !!selection}
                canPaste={!!clipboard}
                onCopy={handleCopy}
                onCut={handleCut}
                onPaste={handlePaste}
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
        </div>

        {/* Panel toggle button - positioned outside panel for proper z-index */}
        <button
          className={`${styles.panelToggle} ${isPanelCollapsed ? styles.collapsed : ''}`}
          onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
          aria-label={isPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
          title={isPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {isPanelCollapsed ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </button>
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <div className={styles.container}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  )
}
