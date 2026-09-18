export type MatrixPattern = 'squares' | 'bricks' | 'bricksVertical'

export type Tool = 'draw' | 'fill' | 'colorPicker'

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