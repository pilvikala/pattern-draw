'use client'

import { useState } from 'react'
import type { MatrixPattern } from '@/lib/types'
import UserMenu from './UserMenu'
import styles from './MobileMenu.module.css'

interface MobileMenuProps {
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

export default function MobileMenu({
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
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleClear = () => {
    if (confirm('Are you sure you want to create a new drawing? This will clear the current canvas.')) {
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
              <div className={styles.userMenuSection}>
                <UserMenu className="mobile" />
              </div>

              <div className={styles.menuItem}>
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

              <div className={styles.menuItem}>
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

              <div className={styles.menuItem}>
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

              <div className={styles.menuItem}>
                <button onClick={onSetCanvasSize} className={styles.setSizeButton}>
                  Set Canvas Size
                </button>
              </div>

              <div className={styles.menuActions}>
                <button onClick={handleClear} className={styles.menuButton}>
                  New Drawing
                </button>
                {onSave && (
                  <button
                    onClick={onSave}
                    className={styles.menuButton}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                )}
                <button onClick={onShare} className={styles.menuButton}>
                  Share Link
                </button>
                <button onClick={onDownload} className={styles.menuButton}>
                  Download
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

