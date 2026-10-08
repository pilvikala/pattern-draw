'use client'

import { LineIcon, EraserIcon, FillIcon, SelectIcon, CopyIcon, CutIcon, PasteIcon, MirrorIcon } from './icons'
import PencilToolButton from './PencilToolButton'
import type { FreehandPenSettings } from './PencilToolButton'
import type { PixelShape } from '@/lib/cells'
import styles from './CompactColorPicker.module.css'

interface CompactColorPickerProps {
  selectedColor: string
  onColorChange: (color: string) => void
  onColorSave: (color: string) => void
  isDrawMode: boolean
  onDrawModeSelect: () => void
  pixelShape: PixelShape
  onPixelShapeChange: (shape: PixelShape) => void
  // Set while a freehand layer is active (see PencilToolButton).
  freehandPen?: FreehandPenSettings
  isLineMode: boolean
  onLineModeSelect: () => void
  onLinePixelShapeChange: (shape: PixelShape) => void
  isEraseMode: boolean
  onEraseModeToggle: (enabled: boolean) => void
  isColorPickerMode: boolean
  onColorPickerModeToggle: (enabled: boolean) => void
  isFillMode: boolean
  onFillModeToggle: (enabled: boolean) => void
  // Fill floods cells, so it can't be used on a freehand layer.
  fillDisabled?: boolean
  isSelectMode: boolean
  onSelectModeToggle: (enabled: boolean) => void
  canCopy: boolean
  canPaste: boolean
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onMirror: () => void
}

export default function CompactColorPicker({
  selectedColor,
  onColorChange,
  onColorSave,
  isDrawMode,
  onDrawModeSelect,
  pixelShape,
  onPixelShapeChange,
  freehandPen,
  isLineMode,
  onLineModeSelect,
  onLinePixelShapeChange,
  isEraseMode,
  onEraseModeToggle,
  isColorPickerMode,
  onColorPickerModeToggle,
  isFillMode,
  onFillModeToggle,
  fillDisabled,
  isSelectMode,
  onSelectModeToggle,
  canCopy,
  canPaste,
  onCopy,
  onCut,
  onPaste,
  onMirror,
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
      <PencilToolButton
        isDrawMode={isDrawMode}
        onDrawModeSelect={onDrawModeSelect}
        pixelShape={pixelShape}
        onPixelShapeChange={onPixelShapeChange}
        freehandPen={freehandPen}
        buttonClassName={styles.pickerButton}
        activeClassName={styles.active}
        iconClassName={styles.pickerIcon}
      />
      <PencilToolButton
        isDrawMode={isLineMode}
        onDrawModeSelect={onLineModeSelect}
        pixelShape={pixelShape}
        onPixelShapeChange={onLinePixelShapeChange}
        freehandPen={freehandPen}
        icon={LineIcon}
        toolName="Line tool"
        shortcutKey="L"
        buttonClassName={styles.pickerButton}
        activeClassName={styles.active}
        iconClassName={styles.pickerIcon}
      />
      <button
        onClick={() => onEraseModeToggle(!isEraseMode)}
        className={`${styles.pickerButton} ${isEraseMode ? styles.active : ''}`}
        title="Eraser tool (E)"
        aria-pressed={isEraseMode}
      >
        <EraserIcon className={styles.pickerIcon} />
      </button>
      <button
        onClick={() => onFillModeToggle(!isFillMode)}
        disabled={fillDisabled}
        className={`${styles.pickerButton} ${
          isFillMode ? styles.active : ''
        }`}
        title={fillDisabled ? "Fill isn't available on freehand layers" : 'Fill tool (F)'}
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
      <button
        onClick={onMirror}
        disabled={!canCopy}
        className={styles.pickerButton}
        title="Mirror selection (Ctrl+I)"
      >
        <MirrorIcon className={styles.pickerIcon} />
      </button>
    </div>
  )
}

