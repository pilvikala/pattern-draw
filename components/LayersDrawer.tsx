'use client'

import { useEffect, useRef, useState } from 'react'
import LayersList, { type LayersListProps } from './LayersList'
import styles from './LayersDrawer.module.css'

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function LayersDrawer(props: LayersListProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Modal focus contract: move focus into the drawer when it opens, restore
  // it to the button that opened it when it closes - without this, a
  // keyboard/screen-reader user's focus would silently stay on (or land
  // back on) a trigger buried behind the overlay, or nothing at all.
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus()
    } else {
      triggerButtonRef.current?.focus()
    }
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      return
    }
    // A basic focus trap: without it, Tab/Shift+Tab would walk focus out of
    // the drawer and into the editor behind the overlay, which a modal
    // dialog must not allow.
    if (e.key === 'Tab' && drawerRef.current) {
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <>
      <button
        ref={triggerButtonRef}
        className={styles.drawerButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Layers"
        aria-expanded={isOpen}
        title="Layers"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <div
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="layers-drawer-title"
            onKeyDown={handleKeyDown}
          >
            <div className={styles.drawerHeader}>
              <h2 id="layers-drawer-title">Layers</h2>
              <button
                ref={closeButtonRef}
                className={styles.closeButton}
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.drawerContent}>
              <LayersList {...props} />
            </div>
          </div>
        </>
      )}
    </>
  )
}
