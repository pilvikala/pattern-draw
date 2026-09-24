'use client'

import LayersList, { type LayersListProps } from './LayersList'
import styles from './LayersPanel.module.css'

export default function LayersPanel(props: LayersListProps) {
  return (
    <div className={styles.layersPanel}>
      <h3 className={styles.heading}>Layers</h3>
      <LayersList {...props} />
    </div>
  )
}
