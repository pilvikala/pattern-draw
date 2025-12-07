'use client'

import { useRef } from 'react'
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
  const longPressTimer = useRef<number | null>(null)
  const longPressTarget = useRef<string | null>(null)

  const handleTouchStart = (color: string) => {
    longPressTarget.current = color
    longPressTimer.current = window.setTimeout(() => {
      if (longPressTarget.current === color) {
        onColorRemove(color)
        longPressTarget.current = null
      }
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (longPressTarget.current) {
      onColorSelect(longPressTarget.current)
      longPressTarget.current = null
    }
  }

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
            onTouchStart={() => handleTouchStart(color)}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onContextMenu={(e) => {
              e.preventDefault()
              onColorRemove(color)
            }}
            title={`Click to select, long-press or right-click to remove`}
          />
        ))}
      </div>
      <p className={styles.hint}>Click to select, long-press or right-click to remove</p>
    </div>
  )
}


