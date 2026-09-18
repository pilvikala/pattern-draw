'use client'

import { PencilIcon, FillIcon, SelectIcon, CopyIcon, CutIcon, PasteIcon } from './icons'
import styles from './CompactColorPicker.module.css'

interface CompactColorPickerProps {
  selectedColor: string
  onColorChange: (color: string) => void
  onColorSave: (color: string) => void
  isDrawMode: boolean
  onDrawModeSelect: () => void
  isColorPickerMode: boolean
  onColorPickerModeToggle: (enabled: boolean) => void
  isFillMode: boolean
  onFillModeToggle: (enabled: boolean) => void
  isSelectMode: boolean
  onSelectModeToggle: (enabled: boolean) => void
  canCopy: boolean
  canPaste: boolean
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
}

export default function CompactColorPicker({
  selectedColor,
  onColorChange,
  onColorSave,
  isDrawMode,
  onDrawModeSelect,
  isColorPickerMode,
  onColorPickerModeToggle,
  isFillMode,
  onFillModeToggle,
  isSelectMode,
  onSelectModeToggle,
  canCopy,
  canPaste,
  onCopy,
  onCut,
  onPaste,
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
        onClick={onDrawModeSelect}
        className={`${styles.pickerButton} ${isDrawMode ? styles.active : ''}`}
        title="Draw tool (P)"
        aria-pressed={isDrawMode}
      >
        <PencilIcon className={styles.pickerIcon} />
      </button>
      <button
        onClick={() => onFillModeToggle(!isFillMode)}
        className={`${styles.pickerButton} ${
          isFillMode ? styles.active : ''
        }`}
        title="Fill tool (F)"
        aria-pressed={isFillMode}
      >
        <FillIcon className={styles.pickerIcon} />
      </button>
      <button
        onClick={() => onColorPickerModeToggle(!isColorPickerMode)}
        className={`${styles.pickerButton} ${
          isColorPickerMode ? styles.active : ''
        }`}
        title="Pick color from canvas (C)"
        aria-pressed={isColorPickerMode}
      >
        <img
          src="/color-picker.png"
          alt="Color picker"
          className={styles.pickerIcon}
        />
      </button>
      <button
        onClick={() => onSelectModeToggle(!isSelectMode)}
        className={`${styles.pickerButton} ${isSelectMode ? styles.active : ''}`}
        title="Select tool (S)"
        aria-pressed={isSelectMode}
      >
        <SelectIcon className={styles.pickerIcon} />
      </button>
      <button
        onClick={onCopy}
        disabled={!canCopy}
        className={styles.pickerButton}
        title="Copy selection (Ctrl+C)"
      >
        <CopyIcon className={styles.pickerIcon} />
      </button>
      <button
        onClick={onCut}
        disabled={!canCopy}
        className={styles.pickerButton}
        title="Cut selection (Ctrl+X)"
      >
        <CutIcon className={styles.pickerIcon} />
      </button>
      <button
        onClick={onPaste}
        disabled={!canPaste}
        className={styles.pickerButton}
        title="Paste (Ctrl+V)"
      >
        <PasteIcon className={styles.pickerIcon} />
      </button>
    </div>
  )
}

