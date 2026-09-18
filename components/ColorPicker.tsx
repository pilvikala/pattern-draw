'use client'

import { useRef } from 'react'
import { PencilIcon, FillIcon, SelectIcon, CopyIcon, CutIcon, PasteIcon } from './icons'
import styles from './ColorPicker.module.css'

interface ColorPickerProps {
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

export default function ColorPicker({
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
          onClick={onDrawModeSelect}
          className={`${styles.toolButton} ${isDrawMode ? styles.active : ''}`}
          title={isDrawMode ? 'Draw tool active (P)' : 'Draw tool (P)'}
          aria-label="Draw tool"
          aria-pressed={isDrawMode}
        >
          <PencilIcon className={styles.toolIcon} />
        </button>
        <button
          onClick={() => onFillModeToggle(!isFillMode)}
          className={`${styles.toolButton} ${isFillMode ? styles.active : ''}`}
          title={isFillMode ? 'Fill tool active (click canvas to fill) (F)' : 'Fill tool (F)'}
          aria-label="Fill tool"
          aria-pressed={isFillMode}
        >
          <FillIcon className={styles.toolIcon} />
        </button>
        <button
          onClick={() => onColorPickerModeToggle(!isColorPickerMode)}
          className={`${styles.toolButton} ${isColorPickerMode ? styles.active : ''}`}
          title={isColorPickerMode ? 'Pick Color (Click on canvas) (C)' : 'Pick Color from Canvas (C)'}
          aria-label="Color picker tool"
          aria-pressed={isColorPickerMode}
        >
          <img src="/color-picker.png" alt="" className={styles.toolIcon} />
        </button>
        <button
          onClick={() => onSelectModeToggle(!isSelectMode)}
          className={`${styles.toolButton} ${isSelectMode ? styles.active : ''}`}
          title={isSelectMode ? 'Select tool active (drag to select, drag inside to move) (S)' : 'Select tool (S)'}
          aria-label="Select tool"
          aria-pressed={isSelectMode}
        >
          <SelectIcon className={styles.toolIcon} />
        </button>
        <button
          onClick={onCopy}
          disabled={!canCopy}
          className={styles.toolButton}
          title="Copy selection (Ctrl+C)"
          aria-label="Copy selection"
        >
          <CopyIcon className={styles.toolIcon} />
        </button>
        <button
          onClick={onCut}
          disabled={!canCopy}
          className={styles.toolButton}
          title="Cut selection (Ctrl+X)"
          aria-label="Cut selection"
        >
          <CutIcon className={styles.toolIcon} />
        </button>
        <button
          onClick={onPaste}
          disabled={!canPaste}
          className={styles.toolButton}
          title="Paste (Ctrl+V)"
          aria-label="Paste"
        >
          <PasteIcon className={styles.toolIcon} />
        </button>
      </div>
    </div>
  )
}
