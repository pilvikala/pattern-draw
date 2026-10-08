export type MatrixPattern = 'squares' | 'bricks' | 'bricksVertical'

export type Tool = 'draw' | 'erase' | 'fill' | 'colorPicker' | 'select' | 'line'

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

// The cells the select tool has selected - any shape, built by adding and
// subtracting rectangles. Stored as non-overlapping rectangles in a canonical
// form (see lib/selection.ts), so a plain rectangle is a single entry and the
// same area always comes out as the same list.
export interface CellSelection {
  rects: SelectionRect[]
}

// How a new marquee combines with the current selection.
export type SelectionMode = 'replace' | 'add' | 'subtract'

export interface ClipboardData {
  // Size of the selection's bounding box.
  width: number
  height: number
  // The selected area, relative to the bounding box's top-left corner. A
  // paste only overwrites these cells.
  rects: SelectionRect[]
  // key = "relRow,relCol" relative to the selection's top-left corner, one
  // entry per selected cell. A value of TRANSPARENT means the cell was empty
  // when copied.
  cells: { [key: string]: string }
  // Present only when copied from a freehand layer (cells is then empty):
  // the strokes inside the selection, relative to its top-left corner.
  strokes?: Stroke[]
}

// A single freehand pen stroke. Everything is measured in grid cells (not
// screen pixels) so a stroke keeps its place and proportions when the pixel
// size changes: (0, 0) is the canvas's top-left corner and (canvasWidth,
// canvasHeight) its bottom-right, and `width` is the line thickness in cells.
// Values are quantized to two decimals (see lib/strokes.ts) so they survive
// the compact serialization exactly.
export interface Stroke {
  color: string
  width: number
  // Flat [x0, y0, x1, y1, ...] polyline. A single point is a dot.
  points: number[]
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  // Pixel layers paint into `grid`. Freehand layers keep it as an empty
  // object so code that only knows about grids (history cost, merging,
  // resizing) keeps working, and carry their content in `strokes` instead.
  grid: { [key: string]: string }
  // Absent (not 'pixel') on pixel layers - that is what every drawing saved
  // before freehand layers existed looks like, and omitting it keeps their
  // JSON byte-for-byte unchanged.
  type?: 'freehand'
  strokes?: Stroke[]
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