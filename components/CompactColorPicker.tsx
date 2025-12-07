'use client'

import styles from './CompactColorPicker.module.css'

interface CompactColorPickerProps {
  selectedColor: string
  onColorChange: (color: string) => void
  onColorSave: (color: string) => void
  isColorPickerMode: boolean
  onColorPickerModeToggle: (enabled: boolean) => void
}

export default function CompactColorPicker({
  selectedColor,
  onColorChange,
  onColorSave,
  isColorPickerMode,
  onColorPickerModeToggle,
}: CompactColorPickerProps) {
  const handleSave = () => {
    onColorSave(selectedColor)
  }

  return (
    <div className={styles.compactPicker}>
      <div
        className={styles.colorPreview}
        style={{ backgroundColor: selectedColor }}
        onClick={() => {
          const input = document.getElementById('color-input') as HTMLInputElement
          input?.click()
        }}
      />
      <input
        id="color-input"
        type="color"
        value={selectedColor}
        onChange={(e) => onColorChange(e.target.value)}
        className={styles.colorInput}
      />
      <button
        onClick={handleSave}
        className={styles.saveButton}
        title="Save color"
      >
        +
      </button>
      <button
        onClick={() => onColorPickerModeToggle(!isColorPickerMode)}
        className={`${styles.pickerButton} ${
          isColorPickerMode ? styles.active : ''
        }`}
        title="Pick color from canvas"
      >
        <img
          src="/color-picker.png"
          alt="Color picker"
          className={styles.pickerIcon}
        />
      </button>
    </div>
  )
}

