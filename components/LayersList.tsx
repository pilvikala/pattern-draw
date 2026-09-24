'use client'

import { useEffect, useRef, useState } from 'react'
import type { Layer } from '@/lib/types'
import { MAX_LAYER_NAME_LENGTH } from '@/lib/layers'
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
  // Setting editingId to null unmounts the input; if unmounting a focused
  // element ever fires its onBlur (browser-dependent), that blur would call
  // commitEditing via the same closure that was active while editing -
  // still holding the pre-cancel editingId/editingName - and commit the
  // rename Escape was meant to discard. This flag lets commitEditing tell
  // "cancelled" apart from "blurred/Enter while actively editing" and skip
  // the rename in the former case. Reset in startEditing (not by
  // commitEditing itself) so it doesn't depend on blur actually firing,
  // which isn't reliable across browsers for this unmount-on-state-change
  // pattern - each new editing session simply starts with a clean flag.
  const isCancellingRef = useRef(false)
  // Tracks each row's name button so focus can return to it once editing
  // ends (input unmounts, button remounts) - without this, focus falls
  // out of the list/drawer entirely (to <body>), and a subsequent Escape
  // press no longer bubbles through the drawer's own key handler to close
  // it, since the keydown target is no longer inside that DOM subtree.
  const nameButtonRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const lastEditedIdRef = useRef<string | null>(null)

  const startEditing = (layer: Layer) => {
    isCancellingRef.current = false
    setEditingId(layer.id)
    setEditingName(layer.name)
  }

  const commitEditing = () => {
    if (isCancellingRef.current) return
    if (editingId) {
      onRenameLayer(editingId, editingName)
    }
    lastEditedIdRef.current = editingId
    setEditingId(null)
  }

  const cancelEditing = () => {
    isCancellingRef.current = true
    lastEditedIdRef.current = editingId
    setEditingId(null)
  }

  // Runs after the input->button swap has actually committed to the DOM,
  // unlike a focus() call inside commitEditing/cancelEditing themselves
  // (which run before that re-render, while the button doesn't exist yet).
  useEffect(() => {
    if (editingId === null && lastEditedIdRef.current) {
      nameButtonRefs.current.get(lastEditedIdRef.current)?.focus()
      lastEditedIdRef.current = null
    }
  }, [editingId])

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
                  aria-label="Layer name"
                  maxLength={MAX_LAYER_NAME_LENGTH}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEditing}
                  onKeyDown={(e) => {
                    // Stop propagation so this doesn't also reach
                    // LayersDrawer's own onKeyDown, which closes the whole
                    // drawer on Escape - without this, cancelling a rename
                    // from inside the mobile drawer unexpectedly dismisses
                    // the drawer too.
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      commitEditing()
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      cancelEditing()
                    }
                  }}
                />
              ) : (
                // A dedicated button (not the <li>) carries selection, so it
                // doesn't nest inside another interactive element and its
                // own Enter/Space/click semantics come for free - no custom
                // key handling needed, and no bubbling conflicts with the
                // sibling buttons below.
                <button
                  ref={(el) => { nameButtonRefs.current.set(layer.id, el) }}
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
                  onClick={() => startEditing(layer)}
                  aria-label="Rename layer"
                  title="Rename layer"
                >
                  ✎
                </button>
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
