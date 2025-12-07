'use client'

import { useState } from 'react'
import styles from './ColorPicker.module.css'

interface ColorPickerProps {
  selectedColor: string
  onColorChange: (color: string) => void
  onColorSave: (color: string) => void
  isColorPickerMode: boolean
  onColorPickerModeToggle: (enabled: boolean) => void
}

export default function ColorPicker({
  selectedColor,
  onColorChange,
  onColorSave,
  isColorPickerMode,
  onColorPickerModeToggle,
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
        <button
          onClick={() => onColorPickerModeToggle(!isColorPickerMode)}
          className={`${styles.pickerButton} ${
            isColorPickerMode ? styles.active : ''
          }`}
        >
          {isColorPickerMode ? 'Pick Color (Click on canvas)' : 'Pick Color from Canvas'}
        </button>
      </div>
    </div>
  )
}

