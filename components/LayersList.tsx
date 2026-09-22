'use client'

import { useState } from 'react'
import type { Layer } from '@/lib/types'
import styles from './LayersList.module.css'

export interface LayersListProps {
  layers: Layer[]
  activeLayerId: string
  canAddLayer: boolean
  onSelectLayer: (id: string) => void
  onAddLayer: () => void
  onDeleteLayer: (id: string) => void
  onRenameLayer: (id: string, name: string) => void
  onToggleVisibility: (id: string) => void
  onMoveLayer: (id: string, direction: 'up' | 'down') => void
  onMergeDown: (id: string) => void
}

export default function LayersList({
  layers,
  activeLayerId,
  canAddLayer,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onRenameLayer,
  onToggleVisibility,
  onMoveLayer,
  onMergeDown,
}: LayersListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const startEditing = (layer: Layer) => {
    setEditingId(layer.id)
    setEditingName(layer.name)
  }

  const commitEditing = () => {
    if (editingId) {
      onRenameLayer(editingId, editingName)
    }
    setEditingId(null)
  }

  // Layers are stored bottom-to-top; the list displays top-to-bottom like a
  // typical layers panel, so it's rendered in reverse array order.
  const rows = layers.map((layer, index) => ({ layer, index })).reverse()

  return (
    <div className={styles.layersList}>
      <button
        onClick={onAddLayer}
        className={styles.addButton}
        disabled={!canAddLayer}
        title={canAddLayer ? undefined : 'Maximum number of layers reached'}
      >
        + Add Layer
      </button>

      <ul className={styles.rows}>
        {rows.map(({ layer, index }) => {
          const isActive = layer.id === activeLayerId
          const canMoveUp = index < layers.length - 1
          const canMoveDown = index > 0
          const canMergeDown = index > 0 && layer.visible
          const canDelete = layers.length > 1

          return (
            <li
              key={layer.id}
              className={`${styles.row} ${isActive ? styles.rowActive : ''}`}
            >
              <button
                className={styles.visibilityToggle}
                onClick={() => onToggleVisibility(layer.id)}
                aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {layer.visible ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>

              {editingId === layer.id ? (
                <input
                  className={styles.nameInput}
                  value={editingName}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEditing()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                // A dedicated button (not the <li>) carries selection, so it
                // doesn't nest inside another interactive element and its
                // own Enter/Space/click semantics come for free - no custom
                // key handling needed, and no bubbling conflicts with the
                // sibling buttons below.
                <button
                  type="button"
                  className={styles.name}
                  onClick={() => onSelectLayer(layer.id)}
                  onDoubleClick={() => startEditing(layer)}
                  aria-pressed={isActive}
                  title="Double-click to rename"
                >
                  {layer.name}
                </button>
              )}

              <div className={styles.rowActions}>
                <button
                  className={styles.iconButton}
                  disabled={!canMoveUp}
                  onClick={() => onMoveLayer(layer.id, 'up')}
                  aria-label="Move layer up"
                  title="Move layer up"
                >
                  ▲
                </button>
                <button
                  className={styles.iconButton}
                  disabled={!canMoveDown}
                  onClick={() => onMoveLayer(layer.id, 'down')}
                  aria-label="Move layer down"
                  title="Move layer down"
                >
                  ▼
                </button>
                <button
                  className={styles.iconButton}
                  disabled={!canMergeDown}
                  onClick={() => onMergeDown(layer.id)}
                  aria-label="Merge down"
                  title="Merge into layer below"
                >
                  ⇩
                </button>
                <button
                  className={`${styles.iconButton} ${styles.deleteButton}`}
                  disabled={!canDelete}
                  onClick={() => onDeleteLayer(layer.id)}
                  aria-label="Delete layer"
                  title="Delete layer"
                >
                  ×
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
