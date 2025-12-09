import type { DrawingData, MatrixPattern } from '@/lib/types'

/**
 * Generates a data URL for a drawing preview image
 * @param drawingData The drawing data to render
 * @param maxSize Maximum width/height for the preview (default: 200)
 * @returns Data URL of the preview image
 */
export function generateDrawingPreview(
    drawingData: DrawingData,
    maxSize: number = 200
): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    const { pattern, pixelSize, canvasWidth, canvasHeight, grid } = drawingData

    // Calculate scale to fit within maxSize
    const cols = canvasWidth
    const rows = canvasHeight

    // For brick patterns, add extra dimension for offset
    const widthOffset = pattern === 'bricks' ? pixelSize / 2 : 0
    const heightOffset = pattern === 'bricksVertical' ? pixelSize / 2 : 0
    const fullWidth = cols * pixelSize + widthOffset
    const fullHeight = rows * pixelSize + heightOffset

    // Calculate scale to fit preview size
    const scale = Math.min(maxSize / fullWidth, maxSize / fullHeight, 1)
    const previewWidth = fullWidth * scale
    const previewHeight = fullHeight * scale

    canvas.width = previewWidth
    canvas.height = previewHeight

    // Scale context for drawing
    ctx.scale(scale, scale)

    // Fill background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, fullWidth, fullHeight)

    // Draw grid
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1 / scale // Adjust line width for scale

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

            // Draw border (only if scale is large enough)
            if (scale > 0.3) {
                ctx.strokeRect(x, y, pixelSize, pixelSize)
            }
        }
    }

    return canvas.toDataURL('image/png')
}

