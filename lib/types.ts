export type MatrixPattern = 'squares' | 'bricks' | 'bricksVertical'

export type Tool = 'draw' | 'fill' | 'colorPicker' | 'select'

// Sentinel used (instead of '#ffffff') to mean "no color painted here" in a
// layer's grid, clipboard cells, or flood-fill comparisons. A cell simply
// absent from a grid map is also transparent - this constant exists so code
// that needs an explicit value for "transparent" (e.g. a dense clipboard
// snapshot) doesn't have to overload a real color like white for it.
export const TRANSPARENT = ''

export interface SelectionRect {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface ClipboardData {
  width: number
  height: number
  // key = "relRow,relCol" relative to the selection's top-left corner.
  // A value of TRANSPARENT means the cell was empty when copied.
  cells: { [key: string]: string }
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  grid: { [key: string]: string }
}

export interface DrawingData {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  colors: { [key: string]: string }
  layers: Layer[]
  activeLayerIndex: number
}

// A single undo/redo snapshot. Carries activeLayerIndex alongside the layer
// stack so undo/redo restores which layer was active at that point too, not
// just the pixel content - otherwise a later paint after an undo could land
// on the wrong layer (e.g. after a reorder/delete changed what's at the
// current active index).
export interface HistoryEntry {
  layers: Layer[]
  activeLayerIndex: number
}

export interface CompressedDrawingData {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  colors: { [key: string]: number }
  grid: string[]
}