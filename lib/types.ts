export type MatrixPattern = 'squares' | 'bricks' | 'bricksVertical'

export type Tool = 'draw' | 'fill' | 'colorPicker' | 'select'

export interface SelectionRect {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface ClipboardData {
  width: number
  height: number
  // key = "relRow,relCol" relative to the selection's top-left corner
  cells: { [key: string]: string }
}

export interface DrawingData {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  colors: { [key: string]: string }
  grid: { [key: string]: string }
}

export interface CompressedDrawingData {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  colors: { [key: string]: number }
  grid: string[]
}