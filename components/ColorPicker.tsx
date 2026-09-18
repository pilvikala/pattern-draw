'use client'

import { useState } from 'react'
import { FillIcon } from './icons'
import styles from './ColorPicker.module.css'

interface ColorPickerProps {
  selectedColor: string
  onColorChange: (color: string) => void
  onColorSave: (color: string) => void
  isColorPickerMode: boolean
  onColorPickerModeToggle: (enabled: boolean) => void
  isFillMode: boolean
  onFillModeToggle: (enabled: boolean) => void
}

export default function ColorPicker({
  selectedColor,
  onColorChange,
  onColorSave,
  isColorPickerMode,
  onColorPickerModeToggle,
  isFillMode,
  onFillModeToggle,
}: ColorPickerProps) {
  const [showPicker, setShowPicker] = useState(false)

  const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onColorChange(e.target.value)
  }

  const handleSave = () => {
    onColorSave(selectedColor)
    alert('Color saved to palette!')
  }

  return (
    <div className={styles.colorPicker}>
      <div className={styles.colorDisplay}>
        <label className={styles.label}>Selected Color</label>
        <div
          className={styles.colorPreview}
          style={{ backgroundColor: selectedColor }}
        />
        <input
          type="color"
          value={selectedColor}
          onChange={handleColorInputChange}
          className={styles.colorInput}
        />
        <input
          type="text"
          value={selectedColor}
          onChange={(e) => onColorChange(e.target.value)}
          className={styles.colorText}
          placeholder="#000000"
        />
        <button onClick={handleSave} className={styles.saveButton}>
          Save Color
        </button>
        <div className={styles.toolButtons}>
          <button
            onClick={() => onFillModeToggle(!isFillMode)}
            className={`${styles.toolButton} ${isFillMode ? styles.active : ''}`}
            title={isFillMode ? 'Fill tool active (click canvas to fill)' : 'Fill tool'}
            aria-label="Fill tool"
            aria-pressed={isFillMode}
          >
            <FillIcon className={styles.toolIcon} />
          </button>
          <button
            onClick={() => onColorPickerModeToggle(!isColorPickerMode)}
            className={`${styles.toolButton} ${isColorPickerMode ? styles.active : ''}`}
            title={isColorPickerMode ? 'Pick Color (Click on canvas)' : 'Pick Color from Canvas'}
            aria-label="Color picker tool"
            aria-pressed={isColorPickerMode}
          >
            <img src="/color-picker.png" alt="" className={styles.toolIcon} />
          </button>
        </div>
      </div>
    </div>
  )
}

