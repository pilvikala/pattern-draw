'use client'

import { useState } from 'react'
import LayersList, { type LayersListProps } from './LayersList'
import styles from './LayersDrawer.module.css'

export default function LayersDrawer(props: LayersListProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        className={styles.drawerButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Layers"
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
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <h2>Layers</h2>
              <button
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
