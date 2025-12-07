'use client'

import styles from './ColorPalette.module.css'

interface ColorPaletteProps {
  colors: string[]
  selectedColor: string
  onColorSelect: (color: string) => void
  onColorPick: (color: string) => void
  onColorRemove: (color: string) => void
}

export default function ColorPalette({
  colors,
  selectedColor,
  onColorSelect,
  onColorPick,
  onColorRemove,
}: ColorPaletteProps) {
  if (colors.length === 0) {
    return (
      <div className={styles.palette}>
        <h3 className={styles.title}>Saved Colors</h3>
        <p className={styles.empty}>No saved colors yet. Save colors to build your palette!</p>
      </div>
    )
  }

  return (
    <div className={styles.palette}>
      <h3 className={styles.title}>Saved Colors</h3>
      <div className={styles.colorGrid}>
        {colors.map((color, index) => (
          <div
            key={index}
            className={`${styles.colorSwatch} ${
              selectedColor === color ? styles.selected : ''
            }`}
            style={{ backgroundColor: color }}
            onClick={() => onColorSelect(color)}
            onContextMenu={(e) => {
              e.preventDefault()
              onColorRemove(color)
            }}
            title={`Left click to select, right click to remove`}
          />
        ))}
      </div>
      <p className={styles.hint}>Click to select, right-click to remove</p>
    </div>
  )
}


