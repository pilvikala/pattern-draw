'use client'

import { MatrixPattern } from '@/app/page'
import styles from './Controls.module.css'

interface ControlsProps {
  pattern: MatrixPattern
  pixelSize: number
  onPatternChange: (pattern: MatrixPattern) => void
  onPixelSizeChange: (size: number) => void
  onClear: () => void
  onShare: () => void
  onDownload: () => void
  onPrint: () => void
}

export default function Controls({
  pattern,
  pixelSize,
  onPatternChange,
  onPixelSizeChange,
  onClear,
  onShare,
  onDownload,
  onPrint,
}: ControlsProps) {
  const handleClear = () => {
    if (confirm('Are you sure you want to clear the canvas?')) {
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

      <div className={styles.buttonGroup}>
        <button onClick={handleClear} className={styles.button}>
          Clear Canvas
        </button>
        <button onClick={onShare} className={styles.button}>
          Share Link
        </button>
        <button onClick={onDownload} className={styles.button}>
          Download
        </button>
        <button onClick={onPrint} className={styles.button}>
          Print
        </button>
      </div>
    </div>
  )
}


