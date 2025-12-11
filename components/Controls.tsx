'use client'

import type { MatrixPattern } from '@/lib/types'
import styles from './Controls.module.css'

interface ControlsProps {
  pattern: MatrixPattern
  pixelSize: number
  tempCanvasWidth: string
  tempCanvasHeight: string
  onPatternChange: (pattern: MatrixPattern) => void
  onPixelSizeChange: (size: number) => void
  onTempCanvasWidthChange: (width: string) => void
  onTempCanvasHeightChange: (height: string) => void
  onSetCanvasSize: () => void
  onClear: () => void
  onShare: () => void
  onDownload: () => void
  onSave?: () => void
  isSaving?: boolean
  onPrint: () => void
  // onPrint is kept for compatibility but not used
}

export default function Controls({
  pattern,
  pixelSize,
  tempCanvasWidth,
  tempCanvasHeight,
  onPatternChange,
  onPixelSizeChange,
  onTempCanvasWidthChange,
  onTempCanvasHeightChange,
  onSetCanvasSize,
  onClear,
  onShare,
  onDownload,
  onSave,
  isSaving,
  onPrint,
}: ControlsProps) {
  const handleClear = () => {
    if (confirm('Are you sure you want to create a new drawing? This will clear the current canvas.')) {
      onClear()
    }
  }

  return (
    <div className={styles.controls}>
      <div className={styles.controlGroup}>
        <label className={styles.label}>Matrix Pattern</label>
        <select
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value as MatrixPattern)}
          className={styles.select}
        >
          <option value="squares">Regular Squares</option>
          <option value="bricks">Interleaved (Bricks)</option>
          <option value="bricksVertical">Interleaved Vertical</option>
        </select>
      </div>

      <div className={styles.controlGroup}>
        <label className={styles.label}>
          Pixel Size: {pixelSize}px
        </label>
        <input
          type="range"
          min="10"
          max="50"
          value={pixelSize}
          onChange={(e) => onPixelSizeChange(parseInt(e.target.value))}
          className={styles.slider}
        />
      </div>

      <div className={styles.controlGroup}>
        <label className={styles.label}>
          Canvas Width (pixels)
        </label>
        <input
          type="text"
          value={tempCanvasWidth}
          onChange={(e) => onTempCanvasWidthChange(e.target.value)}
          className={styles.textInput}
          placeholder="10-200"
        />
      </div>

      <div className={styles.controlGroup}>
        <label className={styles.label}>
          Canvas Height (pixels)
        </label>
        <input
          type="text"
          value={tempCanvasHeight}
          onChange={(e) => onTempCanvasHeightChange(e.target.value)}
          className={styles.textInput}
          placeholder="10-200"
        />
      </div>

      <div className={styles.controlGroup}>
        <button onClick={onSetCanvasSize} className={styles.setSizeButton}>
          Set Canvas Size
        </button>
      </div>

      <div className={styles.buttonGroup}>
        <button onClick={handleClear} className={styles.button}>
          New Drawing
        </button>
        {onSave && (
          <button
            onClick={onSave}
            className={styles.button}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        )}
        <button onClick={onShare} className={styles.button}>
          Share Link
        </button>
        <button onClick={onDownload} className={styles.button}>
          Download
        </button>
      </div>
    </div>
  )
}


