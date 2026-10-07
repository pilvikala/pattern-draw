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
import { copySelectionCells, clearRectFromGrid, pasteClipboardToGrid, mirrorRectHorizontally } from '@/lib/selection'
import { compositeLayers, createLayer, createFreehandLayer, createDefaultLayers, clampActiveLayerIndex, normalizeDrawingData, mergeLayerDown, isFreehandLayer, MAX_LAYERS, totalGridEntryCount, MAX_TOTAL_GRID_ENTRIES } from '@/lib/layers'
import {
  canvasBounds,
  clearStrokesInRect,
  copyStrokesInRect,
  eraseStrokesAt,
  mirrorStrokesInRect,
  moveStrokesInRect,
  pasteStrokes,
  shiftStrokes,
  strokeColorAt,
  strokesWithinLimits,
  DEFAULT_STROKE_WIDTH,
} from '@/lib/strokes'
import { trimHistoryToBudget } from '@/lib/history'
import { drawOverlayLayers, splitRenderLayers } from '@/lib/freehandRender'
import { paintCell, cellColorAt, cellQuarters, quarterAt, drawCell, PIXEL_SHAPES } from '@/lib/cells'
import type { PixelShape } from '@/lib/cells'
import type { DrawingData, MatrixPattern, Tool, SelectionRect, ClipboardData, Layer, HistoryEntry, Stroke } from '@/lib/types'
import { TRANSPARENT } from '@/lib/types'
import UserMenu from '@/components/UserMenu'
import { useToast } from '@/components/ToastProvider'
import styles from './page.module.css'

// Re-export types for backward compatibility
export type { MatrixPattern, DrawingData } from '@/lib/types'

// A drawing shared as a URL becomes unwieldy (and risks silent truncation by
// chat apps, SMS, older proxies, etc.) past roughly this many characters.
const SAFE_SHARE_URL_LENGTH = 2000

// The line-width slider's range and step, in cells. Pixel size scales it, so
// the same width looks right on any canvas zoom; loaded drawings may carry
// wider strokes than the slider offers (see MAX_STROKE_WIDTH).
const STROKE_WIDTH_MIN = 0.1
const STROKE_WIDTH_MAX = 2
const STROKE_WIDTH_STEP = 0.1

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
  // Which part of a cell the pencil paints - the whole cell or one of its
  // triangular halves (see lib/cells.ts).
  const [pixelShape, setPixelShape] = useState<PixelShape>('full')
  // Thickness, in cells, of the pencil's line on a freehand layer.
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH)
  // Tool to restore once the color picker has been used - the picker is
  // momentary, unlike fill/draw which stay selected until changed.
  const previousToolRef = useRef<Tool>('draw')
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null)
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingCopy, setIsSavingCopy] = useState(false)
  // Serialized snapshot of the last drawing persisted to the server (manual or
  // auto save), used to skip autosaves when nothing changed.
  const lastPersistedRef = useRef<string | null>(null)
  const autosaveInFlightRef = useRef(false)
  // Bumped whenever the current drawing is replaced (new drawing, load) so a
  // slow autosave response for the previous drawing is discarded, not applied.
  const drawingGenerationRef = useRef(0)
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

  // The flattened view of all visible layers - what's actually drawn on the
  // canvas and what export/preview render.
  // Only the layers below the lowest visible freehand layer: that layer and
  // everything above it is drawn over the grid by DrawingCanvas, so a freehand
  // layer can sit anywhere in the stack (see splitRenderLayers). With no
  // visible freehand layer this is every layer, as it always was.
  const compositeGrid = useMemo(() => compositeLayers(splitRenderLayers(layers).base), [layers])
  const activeLayer = layers[activeLayerIndex] ?? layers[0]
  const activeIsFreehand = isFreehandLayer(activeLayer)
  const strokeBounds = useMemo(() => canvasBounds(pattern, canvasWidth, canvasHeight), [pattern, canvasWidth, canvasHeight])
  // What the pencil's menu shows instead of the pixel shapes while a freehand
  // layer is active.
  const freehandPen = useMemo(
    () => (activeIsFreehand ? { width: strokeWidth, min: STROKE_WIDTH_MIN, max: STROKE_WIDTH_MAX, step: STROKE_WIDTH_STEP, onWidthChange: setStrokeWidth } : undefined),
    [activeIsFreehand, strokeWidth]
  )
  // The moving-selection "hole"/floating-preview composites (everything
  // except the active layer, and everything above it) are computed inside
  // DrawingCanvas itself, from the raw `layers`/`activeLayerIndex` passed
  // down below - not here. `selection` goes non-null as soon as the user
  // starts drawing the initial marquee, well before any move begins, so a
  // memo here keyed on `selection` would still redo that composite work
  // (up to canvasWidth*canvasHeight*layerCount cell visits at the editor's
  // limits) on every marquee-drag mousemove, for a preview nothing reads
  // until a move actually starts. Computing it inside DrawingCanvas's own
  // isMovingSelection-gated effect ties the work to the condition that
  // actually needs it.

  // Keep refs in sync with state
  useEffect(() => {
    layersRef.current = layers
  }, [layers])

  useEffect(() => {
    activeLayerIndexRef.current = activeLayerIndex
  }, [activeLayerIndex])

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
    const trimmedHistory = trimHistoryToBudget(newHistory)
    historyRef.current = trimmedHistory
    const newIdx = trimmedHistory.length - 1
    historyIndexRef.current = newIdx
    lastSavedLayersRef.current = currentLayers
    setHistory(trimmedHistory)
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
              // Already normalized server-side: the GET route reads it via
              // deserializeDrawing, which now always normalizes internally.
              drawingGenerationRef.current++
              applyLoadedDrawing(drawingData)
              lastPersistedRef.current = JSON.stringify(normalizeDrawingData(drawingData))
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

  // Normalized before returning - the color text input (ColorPicker) takes
  // arbitrary typed text with no validation, so `selectedColor` (and
  // through it, painted cells) can hold a non-hex string. Every consumer of
  // this snapshot (localStorage, share-link encoding, API saves) needs the
  // same bounded/validated shape share and reload already get via
  // normalizeDrawingData - without this, a share link or localStorage save
  // could embed an invalid color that a later load then silently drops.
  const buildDrawingData = useCallback((): DrawingData => normalizeDrawingData({
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
      const data = buildDrawingData()
      // Same aggregate cap as the API/share-link paths (see
      // MAX_TOTAL_GRID_ENTRIES's comment) - without it, a drawing near the
      // editor's own per-layer limits (50 layers, 500x500) would get
      // JSON.stringified and written to localStorage on every debounced
      // edit, which can block the main thread and repeatedly exceed the
      // browser's per-origin storage quota. This autosave is a passive
      // recovery mechanism, not a user-initiated save, so it skips
      // silently rather than surfacing an error for something the user
      // didn't explicitly ask for.
      if (totalGridEntryCount(data) > MAX_TOTAL_GRID_ENTRIES) return
      localStorage.setItem('pattern-draw-data', JSON.stringify(data))
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

  const handlePixelShapeChange = (shape: PixelShape) => {
    setPixelShape(shape)
    setTool('draw')
  }

  const handleEraseModeToggle = (enabled: boolean) => {
    setTool(enabled ? 'erase' : 'draw')
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

  // The freehand counterpart of updateActiveLayerGrid. Returns whether the
  // update was applied: an edit that would leave the layer over its stroke
  // limits is refused (see strokesWithinLimits) rather than applied and then
  // silently cut off the next time the drawing is saved or reloaded. Cutting
  // a stroke in two counts, so even removing part of a layer can hit it.
  const updateActiveLayerStrokes = useCallback((
    updater: (strokes: Stroke[]) => Stroke[],
    onApplied?: () => void
  ): boolean => {
    const idx = activeLayerIndexRef.current
    const targetLayer = layersRef.current[idx]
    if (!targetLayer || !isFreehandLayer(targetLayer)) return false
    const newStrokes = updater(targetLayer.strokes ?? [])
    if (!strokesWithinLimits(newStrokes)) {
      showToast('This layer has too many strokes. Add another freehand layer to keep drawing.', 'error')
      return false
    }
    const newLayers = layersRef.current.map((l, i) => (i === idx ? { ...l, strokes: newStrokes } : l))
    layersRef.current = newLayers
    setLayers(newLayers)
    onApplied?.()
    return true
  }, [showToast])

  const getActiveStrokes = (): Stroke[] => layersRef.current[activeLayerIndexRef.current]?.strokes ?? []

  // A finished pencil stroke from the canvas - one undo step per stroke.
  const handleStrokeCommit = useCallback((stroke: Stroke) => {
    updateActiveLayerStrokes((prev) => [...prev, stroke], saveToHistoryImmediate)
  }, [saveToHistoryImmediate, updateActiveLayerStrokes])

  // The eraser on a freehand layer removes whole strokes it touches.
  const handleStrokeErase = useCallback((x: number, y: number, radius: number) => {
    const current = layersRef.current[activeLayerIndexRef.current]?.strokes ?? []
    if (eraseStrokesAt(current, x, y, radius) === current) return
    updateActiveLayerStrokes(
      (prev) => eraseStrokesAt(prev, x, y, radius),
      () => { if (!isUndoRedoRef.current) saveToHistory() }
    )
  }, [saveToHistory, updateActiveLayerStrokes])

  const handleSelectionMoveEnd = useCallback((deltaRow: number, deltaCol: number) => {
    if (!selection) return
    const newRect: SelectionRect = {
      startRow: selection.startRow + deltaRow,
      startCol: selection.startCol + deltaCol,
      endRow: selection.endRow + deltaRow,
      endCol: selection.endCol + deltaCol,
    }
    if (isFreehandLayer(layersRef.current[activeLayerIndexRef.current])) {
      if (!updateActiveLayerStrokes((prev) => moveStrokesInRect(prev, selection, deltaRow, deltaCol, strokeBounds), saveToHistoryImmediate)) return
    } else {
      updateActiveLayerGrid((prev) => {
        const clip = copySelectionCells(prev, selection)
        let newGrid = clearRectFromGrid(prev, selection)
        newGrid = pasteClipboardToGrid(newGrid, clip, newRect.startRow, newRect.startCol, canvasWidth, canvasHeight)
        return newGrid
      }, saveToHistoryImmediate)
    }
    setSelection(newRect)
  }, [selection, canvasWidth, canvasHeight, strokeBounds, saveToHistoryImmediate, updateActiveLayerGrid, updateActiveLayerStrokes])

  const handleCopy = useCallback(() => {
    if (!selection) return
    if (isFreehandLayer(layersRef.current[activeLayerIndexRef.current])) {
      setClipboard(copyStrokesInRect(getActiveStrokes(), selection))
      return
    }
    const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
    setClipboard(copySelectionCells(activeGrid, selection))
  }, [selection])

  const handleCut = useCallback(() => {
    if (!selection) return
    if (isFreehandLayer(layersRef.current[activeLayerIndexRef.current])) {
      const copied = copyStrokesInRect(getActiveStrokes(), selection)
      if (updateActiveLayerStrokes((prev) => clearStrokesInRect(prev, selection), saveToHistoryImmediate)) setClipboard(copied)
      return
    }
    const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
    setClipboard(copySelectionCells(activeGrid, selection))
    updateActiveLayerGrid((prev) => clearRectFromGrid(prev, selection), saveToHistoryImmediate)
  }, [selection, saveToHistoryImmediate, updateActiveLayerGrid, updateActiveLayerStrokes])

  const handlePaste = useCallback(() => {
    if (!clipboard) return
    const targetRow = selection ? selection.startRow : 0
    const targetCol = selection ? selection.startCol : 0
    // Strokes and cells can't be converted into each other.
    const clipboardIsStrokes = !!clipboard.strokes
    const layerIsFreehand = isFreehandLayer(layersRef.current[activeLayerIndexRef.current])
    if (clipboardIsStrokes !== layerIsFreehand) {
      showToast(
        clipboardIsStrokes ? "Strokes can't be pasted onto a pixel layer." : "Pixels can't be pasted onto a freehand layer.",
        'error'
      )
      return
    }
    if (layerIsFreehand) {
      if (!updateActiveLayerStrokes((prev) => pasteStrokes(prev, clipboard, targetRow, targetCol, strokeBounds), saveToHistoryImmediate)) return
    } else {
      updateActiveLayerGrid((prev) => pasteClipboardToGrid(prev, clipboard, targetRow, targetCol, canvasWidth, canvasHeight), saveToHistoryImmediate)
    }
    setTool('select')
    setSelection({
      startRow: targetRow,
      startCol: targetCol,
      endRow: Math.min(targetRow + clipboard.height - 1, canvasHeight - 1),
      endCol: Math.min(targetCol + clipboard.width - 1, canvasWidth - 1),
    })
  }, [clipboard, selection, canvasWidth, canvasHeight, strokeBounds, showToast, saveToHistoryImmediate, updateActiveLayerGrid, updateActiveLayerStrokes])

  const handleDeleteSelection = useCallback(() => {
    if (!selection) return
    if (isFreehandLayer(layersRef.current[activeLayerIndexRef.current])) {
      updateActiveLayerStrokes((prev) => clearStrokesInRect(prev, selection), saveToHistoryImmediate)
      return
    }
    updateActiveLayerGrid((prev) => clearRectFromGrid(prev, selection), saveToHistoryImmediate)
  }, [selection, saveToHistoryImmediate, updateActiveLayerGrid, updateActiveLayerStrokes])

  const handleDeselect = useCallback(() => {
    setSelection(null)
  }, [])

  const handleMirror = useCallback(() => {
    if (!selection) return
    if (isFreehandLayer(layersRef.current[activeLayerIndexRef.current])) {
      updateActiveLayerStrokes((prev) => mirrorStrokesInRect(prev, selection), saveToHistoryImmediate)
      return
    }
    updateActiveLayerGrid((prev) => mirrorRectHorizontally(prev, selection), saveToHistoryImmediate)
  }, [selection, saveToHistoryImmediate, updateActiveLayerGrid, updateActiveLayerStrokes])

  const handleUndo = useCallback(() => {
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
  }, [saveToHistoryImmediate])

  const handleRedo = useCallback(() => {
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
  }, [saveToHistoryImmediate])

  // Fill needs cells to flood, so it isn't available on a freehand layer:
  // selecting one (or undoing/redoing onto one, or returning from the color
  // picker to a remembered fill tool) while fill is active falls back to the
  // pencil.
  useEffect(() => {
    if (tool === 'fill' && activeIsFreehand) setTool('draw')
  }, [tool, activeIsFreehand])

  // Keyboard shortcuts: undo/redo, tool switching (P/E/F/C/S), pencil shape
  // (0-4, only while the pencil is active on a pixel layer), line width ([ and
  // ], on a freehand layer) and select-tool actions (copy/cut/paste/mirror/delete/deselect). Ignored while typing in a text input
  // so hex-color and canvas-size fields keep working.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditable = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isEditable) return

      const isMeta = e.metaKey || e.ctrlKey
      const noModifiers = !e.metaKey && !e.ctrlKey && !e.altKey
      const key = e.key.toLowerCase()

      if (isMeta && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      } else if (isMeta && key === 'y') {
        e.preventDefault()
        handleRedo()
      } else if (isMeta && key === 'i') {
        if (tool === 'select' && selection) {
          e.preventDefault()
          handleMirror()
        }
      } else if (isMeta && key === 'c') {
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
      } else if (noModifiers && key === 'e') {
        e.preventDefault()
        handleEraseModeToggle(tool !== 'erase')
      } else if (noModifiers && key === 'f') {
        e.preventDefault()
        if (!activeIsFreehand) handleFillModeToggle(tool !== 'fill')
      } else if (noModifiers && key === 'c') {
        e.preventDefault()
        handleColorPickerModeToggle(tool !== 'colorPicker')
      } else if (noModifiers && key === 's') {
        e.preventDefault()
        handleSelectModeToggle(tool !== 'select')
      } else if (noModifiers && activeIsFreehand && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const step = e.key === ']' ? STROKE_WIDTH_STEP : -STROKE_WIDTH_STEP
        setStrokeWidth((w) => Math.round(Math.max(STROKE_WIDTH_MIN, Math.min(STROKE_WIDTH_MAX, w + step)) * 100) / 100)
      } else if (noModifiers && tool === 'draw' && !activeIsFreehand) {
        const shortcut = PIXEL_SHAPES.find((s) => s.key === e.key)
        if (shortcut) {
          e.preventDefault()
          setPixelShape(shortcut.shape)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tool, activeIsFreehand, selection, clipboard, handleUndo, handleRedo, handleMirror, handleCopy, handleCut, handlePaste, handleDeselect, handleDeleteSelection, handleDrawModeSelect, handleEraseModeToggle, handleFillModeToggle, handleColorPickerModeToggle, handleSelectModeToggle])

  // The color a viewer sees at a spot: the topmost visible layer that has
  // paint there - a cell's color (the half under the pointer, for a
  // half-pixel) or a stroke passing under it - else the white paper. Walking
  // the stack top-down, rather than reading the flattened grid, is what lets
  // this see through a freehand layer to the pixels beneath it and vice versa.
  const pickVisibleColor = (key: string, point?: { x: number; y: number }): string => {
    const [rowStr, colStr] = key.split(',')
    const row = parseInt(rowStr, 10)
    const col = parseInt(colStr, 10)
    const fx = point?.x ?? 0.5
    const fy = point?.y ?? 0.5
    // The same spot in canvas coordinates, which is what strokes use: the
    // brick patterns shift every other row/column by half a cell.
    const x = col + fx + (pattern === 'bricks' && row % 2 === 1 ? 0.5 : 0)
    const y = row + fy + (pattern === 'bricksVertical' && col % 2 === 1 ? 0.5 : 0)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      if (!layer.visible) continue
      const color = isFreehandLayer(layer) ? strokeColorAt(layer.strokes ?? [], x, y) : cellColorAt(layer.grid[key], fx, fy)
      if (color) return color
    }
    return '#ffffff'
  }

  // `point` is where in the cell the pointer was, as fractions of the cell's
  // size - used by the color picker to tell the two halves of a half-pixel apart.
  const handlePixelFill = (key: string, color: string, point?: { x: number; y: number }) => {
    if (tool === 'colorPicker') {
      // Pick the color as it's visually shown, then return to whichever tool
      // was active before.
      const pixelColor = pickVisibleColor(key, point)
      setSelectedColor(pixelColor)
      handleColorSave(pixelColor)
      setTool(previousToolRef.current)
    } else if (tool === 'fill') {
      // Fill has nothing to flood on a layer of strokes.
      if (isFreehandLayer(layersRef.current[activeLayerIndexRef.current])) return
      const [rowStr, colStr] = key.split(',')
      const row = parseInt(rowStr, 10)
      const col = parseInt(colStr, 10)
      // Fill starts from the clicked quarter of the cell, so clicking the
      // empty half of a half-pixel fills the area around it, not the cell.
      const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
      const startQuarter = quarterAt(point?.x ?? 0.5, point?.y ?? 0.5)
      const targetColor = cellQuarters(activeGrid[key])[startQuarter] || TRANSPARENT
      if (targetColor === color) return

      updateActiveLayerGrid(
        (prev) => floodFillGrid(prev, row, col, targetColor, color, canvasWidth, canvasHeight, startQuarter),
        () => { if (!isUndoRedoRef.current) saveToHistory() }
      )
    } else if (tool === 'erase') {
      // Erasing removes the cell from the active layer's grid entirely (an
      // absent key is transparent), so layers beneath show through.
      const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
      if (!(key in activeGrid)) return

      updateActiveLayerGrid(
        (prev) => {
          const { [key]: _erased, ...rest } = prev
          return rest
        },
        () => { if (!isUndoRedoRef.current) saveToHistory() }
      )
    } else {
      // Dragging repeatedly hits the same cell - skip the no-op update.
      const activeGrid = layersRef.current[activeLayerIndexRef.current]?.grid || {}
      if (activeGrid[key] === paintCell(activeGrid[key], color, pixelShape)) return

      updateActiveLayerGrid(
        (prev) => ({ ...prev, [key]: paintCell(prev[key], color, pixelShape) }),
        () => { if (!isUndoRedoRef.current) saveToHistory() }
      )
    }
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
    drawingGenerationRef.current++
    setCurrentDrawingId(null)
    lastPersistedRef.current = null
    // Clear the URL parameter if present
    if (searchParams.get('id')) {
      router.replace(window.location.pathname)
    }
    // Add clear to history immediately (not debounced). layersRef/
    // activeLayerIndexRef are already updated above, so this pushes exactly
    // the empty state as the new entry.
    commitHistoryEntry()
  }

  const handleNewDrawingCopy = () => {
    setShowNewDrawingModal(false)
    drawingGenerationRef.current++
    setCurrentDrawingId(null)
    lastPersistedRef.current = null
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

      const newBounds = canvasBounds(pattern, newWidth, newHeight)
      const shiftedLayers = layersRef.current.map((layer) => {
        if (isFreehandLayer(layer)) {
          return { ...layer, strokes: shiftStrokes(layer.strokes ?? [], colOffset, rowOffset, newBounds) }
        }
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
    // Always the embedded-data link, never a ?id= one: GET /api/drawings/[id]
    // requires the requester to be signed in *and* be the drawing's owner
    // (401/403 otherwise), so an id-based link can only ever be opened by
    // the person who shared it - useless for sharing with anyone else,
    // which is the entire point of this button. This also always encodes
    // the current in-memory state fresh, so there's no risk of handing out
    // a stale previously-saved version.
    const data = buildDrawingData()

    // Cheap preflight before the expensive encode below (JSON-shape work
    // plus gzip compression) - without it, a drawing near the editor's own
    // limits (50 layers, 500x500) can freeze this tab for a noticeable
    // stretch only to be rejected afterward anyway by the URL-length check,
    // since output that large essentially never compresses under
    // SAFE_SHARE_URL_LENGTH once base64-encoded.
    if (totalGridEntryCount(data) > MAX_TOTAL_GRID_ENTRIES) {
      showToast('This drawing is too large to share as a link.', 'error')
      return
    }

    const encoded = await encodeDrawing(data)
    const url = `${window.location.origin}${window.location.pathname}?drawing=${encoded}`

    if (url.length > SAFE_SHARE_URL_LENGTH) {
      showToast('This drawing is too large to share as a link.', 'error')
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
    // this is the "merge to a single layer" export behavior. Layers from the
    // lowest visible freehand layer up can't be flattened into cells, so
    // they're drawn over the grid afterwards, in stack order.
    const { base, overlay } = splitRenderLayers(layers)
    const flatGrid = compositeLayers(base)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${row},${col}`
        let x = col * pixelSize
        let y = row * pixelSize

        if (pattern === 'bricks' && row % 2 === 1) {
          x += pixelSize / 2
        } else if (pattern === 'bricksVertical' && col % 2 === 1) {
          y += pixelSize / 2
        }

        // Empty cells (and empty halves) keep the white background.
        drawCell(ctx, flatGrid[key], x, y, pixelSize)
        ctx.strokeRect(x, y, pixelSize, pixelSize)
      }
    }

    if (overlay.length > 0) {
      ctx.save()
      ctx.scale(pixelSize, pixelSize)
      drawOverlayLayers(ctx, overlay, { pattern, pixelSize })
      ctx.restore()
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

  // Auto-save the current drawing every minute while signed in. Skips when
  // nothing changed since the last save, when a manual save is running, and
  // for a blank never-saved canvas (avoids creating empty drawings).
  const autosaveStateRef = useRef({ buildDrawingData, currentDrawingId, isSaving, isSavingCopy, router })
  autosaveStateRef.current = { buildDrawingData, currentDrawingId, isSaving, isSavingCopy, router }
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(async () => {
      const { buildDrawingData: build, currentDrawingId: id, isSaving: saving, isSavingCopy: savingCopy, router: r } = autosaveStateRef.current
      if (saving || savingCopy || autosaveInFlightRef.current) return
      // A ?id= drawing is still loading (or failed to): the canvas holds
      // unrelated local content, so don't persist it as a new drawing.
      const urlId = new URLSearchParams(window.location.search).get('id')
      if (urlId && urlId !== id) return
      const generation = drawingGenerationRef.current
      const drawingData = build()
      const snapshot = JSON.stringify(drawingData)
      if (snapshot === lastPersistedRef.current) return
      if (!id && lastPersistedRef.current === null && !drawingData.layers?.some(l => isFreehandLayer(l) ? (l.strokes?.length ?? 0) > 0 : Object.keys(l.grid).length > 0)) return
      autosaveInFlightRef.current = true
      try {
        const response = await fetch(id ? `/api/drawings/${id}` : '/api/drawings', {
          method: id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingData }),
          credentials: 'include',
        })
        if (!response.ok) return // silent; retried on next tick
        const created = id ? null : (await response.json()).drawing
        // The user started a new drawing or loaded another one meanwhile.
        if (generation !== drawingGenerationRef.current) return
        lastPersistedRef.current = snapshot
        if (created) {
          setCurrentDrawingId(created.id)
          // Same as save-as-copy: put the id in the URL so a reload reopens
          // this drawing instead of autosaving a duplicate.
          loadedDrawingIdRef.current = created.id
          r.replace(`${window.location.pathname}?id=${created.id}`)
        }
      } catch (e) {
        console.error('Autosave failed', e)
      } finally {
        autosaveInFlightRef.current = false
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [userId])

  const handleSave = async () => {
    if (!session?.user?.id) {
      showToast('Please sign in to save drawings', 'error')
      router.push('/auth/signin')
      return
    }

    if (autosaveInFlightRef.current) {
      showToast('Autosave in progress, please try again in a moment', 'error')
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
        lastPersistedRef.current = JSON.stringify(drawingData)
        if (currentDrawingId) {
          showToast('Drawing updated!', 'success')
        } else {
          const { drawing } = await response.json()
          setCurrentDrawingId(drawing.id)
          showToast('Drawing saved!', 'success')
        }
      } else {
        const { error } = await response.json().catch(() => ({ error: undefined }))
        throw new Error(error || 'Failed to save drawing')
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
        const { error: message } = await response.json().catch(() => ({ error: undefined }))
        throw new Error(message || 'Failed to save drawing copy')
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

  const addLayer = useCallback((kind: 'pixel' | 'freehand') => {
    // Mirrors the MAX_LAYERS cap normalizeDrawingData enforces for
    // loaded/shared data - without this, ordinary repeated clicking could
    // grow every composite, history snapshot, and localStorage payload
    // past the same limit that guard exists to enforce.
    if (layersRef.current.length >= MAX_LAYERS) {
      showToast(`A drawing can have at most ${MAX_LAYERS} layers.`, 'error')
      return
    }
    const newIndex = layersRef.current.length
    const newLayer = kind === 'freehand' ? createFreehandLayer(`Freehand ${newIndex + 1}`) : createLayer(`Layer ${newIndex + 1}`)
    const newLayers = [...layersRef.current, newLayer]
    layersRef.current = newLayers
    setLayers(newLayers)
    setActiveLayerIndex(newIndex)
    activeLayerIndexRef.current = newIndex
    setSelection(null)
    saveToHistoryImmediate()
  }, [saveToHistoryImmediate, showToast])

  const handleAddLayer = useCallback(() => addLayer('pixel'), [addLayer])
  const handleAddFreehandLayer = useCallback(() => addLayer('freehand'), [addLayer])

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
    if (index <= 0 || !prev[index].visible) return

    const newLayers = mergeLayerDown(prev, id)
    // Not mergeable after all (e.g. a pixel and a freehand layer): nothing
    // changed, so don't move the active layer as if it had.
    if (newLayers === prev) return
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
    canAddLayer: layers.length < MAX_LAYERS,
    onSelectLayer: handleSetActiveLayer,
    onAddLayer: handleAddLayer,
    onAddFreehandLayer: handleAddFreehandLayer,
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
                    title="Undo (Ctrl+Z)"
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
                    title="Redo (Ctrl+Shift+Z)"
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
                pixelShape={pixelShape}
                onPixelShapeChange={handlePixelShapeChange}
                freehandPen={freehandPen}
                isEraseMode={tool === 'erase'}
                onEraseModeToggle={handleEraseModeToggle}
                isColorPickerMode={tool === 'colorPicker'}
                onColorPickerModeToggle={handleColorPickerModeToggle}
                isFillMode={tool === 'fill'}
                onFillModeToggle={handleFillModeToggle}
                fillDisabled={activeIsFreehand}
                isSelectMode={tool === 'select'}
                onSelectModeToggle={handleSelectModeToggle}
                canCopy={tool === 'select' && !!selection}
                canPaste={!!clipboard}
                onCopy={handleCopy}
                onCut={handleCut}
                onPaste={handlePaste}
                onMirror={handleMirror}
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
                strokeWidth={strokeWidth}
                grid={compositeGrid}
                activeLayerGrid={activeLayer?.grid || {}}
                layers={layers}
                activeLayerIndex={activeLayerIndex}
                onPixelFill={handlePixelFill}
                tool={tool}
                selection={selection}
                onSelectionChange={handleSelectionChange}
                onSelectionMoveEnd={handleSelectionMoveEnd}
                onStrokeCommit={handleStrokeCommit}
                onStrokeErase={handleStrokeErase}
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
                pixelShape={pixelShape}
                onPixelShapeChange={handlePixelShapeChange}
                freehandPen={freehandPen}
                isEraseMode={tool === 'erase'}
                onEraseModeToggle={handleEraseModeToggle}
                isColorPickerMode={tool === 'colorPicker'}
                onColorPickerModeToggle={handleColorPickerModeToggle}
                isFillMode={tool === 'fill'}
                onFillModeToggle={handleFillModeToggle}
                fillDisabled={activeIsFreehand}
                isSelectMode={tool === 'select'}
                onSelectModeToggle={handleSelectModeToggle}
                canCopy={tool === 'select' && !!selection}
                canPaste={!!clipboard}
                onCopy={handleCopy}
                onCut={handleCut}
                onPaste={handlePaste}
                onMirror={handleMirror}
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
