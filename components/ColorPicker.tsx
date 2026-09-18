'use client'

import { useRef } from 'react'
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
  const colorInputRef = useRef<HTMLInputElement>(null)

  const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onColorChange(e.target.value)
  }

  const handleSave = () => {
    onColorSave(selectedColor)
  }

  return (
    <div className={styles.colorPicker}>
      <label className={styles.label}>Selected Color</label>
      <div className={styles.controls}>
        <div
          className={styles.colorSwatch}
          style={{ backgroundColor: selectedColor }}
          onClick={() => colorInputRef.current?.click()}
        />
        <input
          ref={colorInputRef}
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
        <button
          onClick={handleSave}
          className={styles.saveButton}
          title="Save color"
        >
          +
        </button>
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
  )
}
