'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { PencilIcon, LineIcon, PixelShapeIcon, StrokeWidthIcon, ChevronDownIcon } from './icons'
import { PIXEL_SHAPES } from '@/lib/cells'
import type { PixelShape } from '@/lib/cells'
import styles from './PencilToolButton.module.css'

// Shown in place of the pixel shapes while a freehand layer is active: the
// pencil then draws a line, so what it offers is the line's thickness.
export interface FreehandPenSettings {
  width: number
  min: number
  max: number
  step: number
  onWidthChange: (width: number) => void
}

interface PencilToolButtonProps {
  isDrawMode: boolean
  onDrawModeSelect: () => void
  // The line tool sits beside the pencil and shares its menu.
  isLineMode: boolean
  onLineModeSelect: () => void
  pixelShape: PixelShape
  onPixelShapeChange: (shape: PixelShape) => void
  // Set while a freehand layer is active.
  freehandPen?: FreehandPenSettings
  // Styling of the surrounding toolbar, so the pencil matches its sibling tools.
  buttonClassName: string
  activeClassName: string
  iconClassName: string
}

// The pencil and line tool buttons plus one dropdown for what they paint: a
// full pixel or one of the four triangular halves (or the line width on a
// freehand layer). Both tools use the same setting.
export default function PencilToolButton({
  isDrawMode,
  onDrawModeSelect,
  isLineMode,
  onLineModeSelect,
  pixelShape,
  onPixelShapeChange,
  freehandPen,
  buttonClassName,
  activeClassName,
  iconClassName,
}: PencilToolButtonProps) {
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isOpen = menuPosition !== null
  const shapeLabel = PIXEL_SHAPES.find((s) => s.shape === pixelShape)?.label ?? ''
  const widthLabel = freehandPen ? `Line width: ${freehandPen.width.toFixed(1)}` : ''
  const currentLabel = freehandPen ? widthLabel : shapeLabel

  // Positioned as `fixed` from the toggle's on-screen rect rather than
  // absolutely inside the toolbar: the compact top bar scrolls horizontally
  // (overflow-x: auto), which would clip an absolutely positioned menu.
  const openMenu = () => {
    const rect = toggleRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({ top: rect.bottom + 4, left: rect.left })
  }

  // Once the menu's size is known, keep it on screen: the desktop tools
  // panel puts the pencil near the bottom-right corner of the window, so the
  // menu flips above the toggle and shifts left when it would overflow.
  useLayoutEffect(() => {
    const menu = menuRef.current
    const toggle = toggleRef.current
    if (!menu || !toggle || !menuPosition) return
    const toggleRect = toggle.getBoundingClientRect()
    const { width, height } = menu.getBoundingClientRect()
    const margin = 8
    let top = toggleRect.bottom + 4
    if (top + height > window.innerHeight - margin && toggleRect.top - 4 - height >= margin) {
      top = toggleRect.top - 4 - height
    }
    const left = Math.max(margin, Math.min(toggleRect.left, window.innerWidth - width - margin))
    if (top !== menuPosition.top || left !== menuPosition.left) setMenuPosition({ top, left })
  }, [menuPosition])

  useEffect(() => {
    if (!isOpen) return
    const close = () => setMenuPosition(null)
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || toggleRef.current?.contains(target)) return
      close()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"], input[type="range"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [isOpen])

  const handleSelect = (shape: PixelShape) => {
    onPixelShapeChange(shape)
    setMenuPosition(null)
  }

  return (
    <div className={styles.group}>
      <button
        onClick={onDrawModeSelect}
        className={`${buttonClassName} ${isDrawMode ? activeClassName : ''}`}
        title={`Draw tool (P) - ${freehandPen ? 'Freehand' : shapeLabel}`}
        aria-label="Draw tool"
        aria-pressed={isDrawMode}
      >
        <PencilIcon className={iconClassName} />
      </button>
      <button
        onClick={onLineModeSelect}
        className={`${buttonClassName} ${isLineMode ? activeClassName : ''}`}
        title={`Line tool (L) - click the start, then the end (Esc or right-click to cancel)`}
        aria-label="Line tool"
        aria-pressed={isLineMode}
      >
        <LineIcon className={iconClassName} />
      </button>
      <button
        ref={toggleRef}
        onClick={() => (isOpen ? setMenuPosition(null) : openMenu())}
        className={styles.shapeToggle}
        title={freehandPen ? `${widthLabel} ([ and ] to change)` : `Pixel shape: ${shapeLabel} (0-4 while drawing)`}
        aria-label={freehandPen ? widthLabel : `Pixel shape: ${shapeLabel}`}
        aria-haspopup={freehandPen ? 'dialog' : 'menu'}
        aria-expanded={isOpen}
      >
        {freehandPen ? (
          <StrokeWidthIcon width={freehandPen.width} min={freehandPen.min} max={freehandPen.max} className={styles.shapeToggleIcon} />
        ) : (
          <PixelShapeIcon shape={pixelShape} className={styles.shapeToggleIcon} />
        )}
        <ChevronDownIcon className={styles.chevron} />
      </button>
      {menuPosition && freehandPen && (
        <div
          ref={menuRef}
          className={`${styles.menu} ${styles.widthMenu}`}
          role="dialog"
          aria-label="Line width"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <label className={styles.widthLabel} htmlFor="stroke-width-slider">
            Line width <span className={styles.widthValue}>{freehandPen.width.toFixed(1)}</span>
            <kbd className={styles.shortcut}>[ ]</kbd>
          </label>
          <input
            id="stroke-width-slider"
            type="range"
            className={styles.widthSlider}
            min={freehandPen.min}
            max={freehandPen.max}
            step={freehandPen.step}
            value={Math.min(freehandPen.max, Math.max(freehandPen.min, freehandPen.width))}
            onChange={(e) => freehandPen.onWidthChange(Number(e.target.value))}
          />
        </div>
      )}
      {menuPosition && !freehandPen && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label="Pixel shape"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          {PIXEL_SHAPES.map(({ shape, key, label }) => (
            <button
              key={shape}
              role="menuitemradio"
              aria-checked={shape === pixelShape}
              className={`${styles.menuItem} ${shape === pixelShape ? styles.menuItemSelected : ''}`}
              onClick={() => handleSelect(shape)}
            >
              <PixelShapeIcon shape={shape} className={styles.menuItemIcon} />
              <span className={styles.menuItemLabel}>{label}</span>
              <kbd className={styles.shortcut}>{key}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
