'use client'

import { useState } from 'react'
import { MatrixPattern } from '@/app/page'
import styles from './MobileMenu.module.css'

interface MobileMenuProps {
  pattern: MatrixPattern
  pixelSize: number
  onPatternChange: (pattern: MatrixPattern) => void
  onPixelSizeChange: (size: number) => void
  onClear: () => void
  onShare: () => void
  onDownload: () => void
  onPrint: () => void
}

export default function MobileMenu({
  pattern,
  pixelSize,
  onPatternChange,
  onPixelSizeChange,
  onClear,
  onShare,
  onDownload,
  onPrint,
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleClear = () => {
    if (confirm('Are you sure you want to clear the canvas?')) {
      onClear()
      setIsOpen(false)
    }
  }

  return (
    <>
      <button
        className={styles.menuButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu"
      >
        <span className={styles.hamburger}>
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className={styles.overlay}
            onClick={() => setIsOpen(false)}
          />
          <div className={styles.menu}>
            <div className={styles.menuHeader}>
              <h2>Settings</h2>
              <button
                className={styles.closeButton}
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className={styles.menuContent}>
              <div className={styles.menuItem}>
                <label className={styles.label}>Matrix Pattern</label>
                <select
                  value={pattern}
                  onChange={(e) => onPatternChange(e.target.value as MatrixPattern)}
                  className={styles.select}
                >
                  <option value="squares">Regular Squares</option>
                  <option value="bricks">Interleaved (Bricks)</option>
                </select>
              </div>

              <div className={styles.menuItem}>
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

              <div className={styles.menuActions}>
                <button onClick={handleClear} className={styles.menuButton}>
                  Clear Canvas
                </button>
                <button onClick={onShare} className={styles.menuButton}>
                  Share Link
                </button>
                <button onClick={onDownload} className={styles.menuButton}>
                  Download
                </button>
                <button onClick={onPrint} className={styles.menuButton}>
                  Print
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

