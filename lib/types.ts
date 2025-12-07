export type MatrixPattern = 'squares' | 'bricks' | 'bricksVertical'

export interface DrawingData {
  pattern: MatrixPattern
  pixelSize: number
  canvasWidth: number
  canvasHeight: number
  colors: { [key: string]: string }
  grid: { [key: string]: string }
}

