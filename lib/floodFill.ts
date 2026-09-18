export function floodFillGrid(
  grid: { [key: string]: string },
  startRow: number,
  startCol: number,
  targetColor: string,
  fillColor: string,
  width: number,
  height: number
): { [key: string]: string } {
  const newGrid = { ...grid }
  const stack: [number, number][] = [[startRow, startCol]]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const [row, col] = stack.pop()!
    if (row < 0 || row >= height || col < 0 || col >= width) continue

    const key = `${row},${col}`
    if (visited.has(key)) continue
    visited.add(key)

    if ((newGrid[key] || '#ffffff') !== targetColor) continue

    newGrid[key] = fillColor
    stack.push([row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1])
  }

  return newGrid
}
