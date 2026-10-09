'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { deserializeDrawing } from '@/lib/serialization'
import { generateDrawingPreview } from '@/lib/drawingPreview'
import type { DrawingData } from '@/lib/types'
import { useToast } from '@/components/ToastProvider'
import { KuvioLogo } from '@/components/KuvioLogo'
import styles from './page.module.css'

interface Drawing {
    id: string
    createdAt: string
    updatedAt: string
    drawing: string
}

export default function DrawingsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { showToast } = useToast()
    const [drawings, setDrawings] = useState<Drawing[]>([])
    const [previews, setPreviews] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [copyingId, setCopyingId] = useState<string | null>(null)

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin')
            return
        }

        if (status === 'authenticated' && session?.user?.id) {
            loadDrawings()
        }
    }, [status, session, router])

    const loadDrawings = async () => {
        try {
            const response = await fetch('/api/drawings')
            if (response.ok) {
                const { drawings: fetchedDrawings } = await response.json()
                setDrawings(fetchedDrawings)

                // Generate previews for all drawings
                const previewMap: Record<string, string> = {}
                fetchedDrawings.forEach((drawing: Drawing) => {
                    const drawingData = deserializeDrawing(drawing.drawing)
                    if (drawingData) {
                        previewMap[drawing.id] = generateDrawingPreview(drawingData, 150)
                    }
                })
                setPreviews(previewMap)
            }
        } catch (error) {
            console.error('Error loading drawings:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this drawing?')) {
            return
        }

        setDeletingId(id)
        try {
            const response = await fetch(`/api/drawings/${id}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                setDrawings(drawings.filter((d) => d.id !== id))
                const newPreviews = { ...previews }
                delete newPreviews[id]
                setPreviews(newPreviews)
            } else {
                showToast('Failed to delete drawing', 'error')
            }
        } catch (error) {
            console.error('Error deleting drawing:', error)
            showToast('Failed to delete drawing', 'error')
        } finally {
            setDeletingId(null)
        }
    }

    const handleCopy = async (id: string) => {
        setCopyingId(id)
        try {
            const response = await fetch(`/api/drawings/${id}/copy`, {
                method: 'POST',
            })

            if (response.ok) {
                const { drawing: copy } = (await response.json()) as { drawing: Drawing }
                // The copy is the most recently updated drawing, so it goes
                // first to match the list's updatedAt-desc order. Its content
                // is identical to the source, so the source preview is reused.
                setDrawings((current) => [copy, ...current])
                setPreviews((current) =>
                    current[id] ? { ...current, [copy.id]: current[id] } : current
                )
                showToast('Drawing copied', 'success')
            } else {
                showToast('Failed to copy drawing', 'error')
            }
        } catch (error) {
            console.error('Error copying drawing:', error)
            showToast('Failed to copy drawing', 'error')
        } finally {
            setCopyingId(null)
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    if (status === 'loading' || loading) {
        return (
            <main className={styles.main}>
                <div className={styles.container}>
                    <div className={styles.loading}>Loading...</div>
                </div>
            </main>
        )
    }

    return (
        <main className={styles.main}>
            <div className={styles.container}>
                <Link href="/" className={styles.logoLink} aria-label="Kuvio home">
                    <KuvioLogo size={28} />
                </Link>
                <div className={styles.header}>
                    <h1 className={styles.title}>My drawings</h1>
                    <Link href="/" className={styles.newButton}>
                        + New drawing
                    </Link>
                </div>

                {drawings.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No drawings yet. Create your first one!</p>
                        <Link href="/" className={styles.emptyButton}>
                            Create drawing
                        </Link>
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {drawings.map((drawing) => (
                            <div key={drawing.id} className={styles.card}>
                                <Link href={`/?id=${drawing.id}`} className={styles.previewLink}>
                                    <div className={styles.preview}>
                                        {previews[drawing.id] ? (
                                            <img
                                                src={previews[drawing.id]}
                                                alt="Drawing preview"
                                                className={styles.previewImage}
                                            />
                                        ) : (
                                            <div className={styles.previewPlaceholder}>Loading...</div>
                                        )}
                                    </div>
                                </Link>
                                <div className={styles.cardInfo}>
                                    <div className={styles.cardDates}>
                                        <div className={styles.date}>
                                            <span className={styles.dateLabel}>Updated:</span>
                                            <span>{formatDate(drawing.updatedAt)}</span>
                                        </div>
                                        <div className={styles.date}>
                                            <span className={styles.dateLabel}>Created:</span>
                                            <span>{formatDate(drawing.createdAt)}</span>
                                        </div>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <Link
                                            href={`/?id=${drawing.id}`}
                                            className={styles.editButton}
                                        >
                                            Edit
                                        </Link>
                                        <button
                                            onClick={() => handleCopy(drawing.id)}
                                            className={styles.copyButton}
                                            // One copy at a time: copyingId only tracks a single
                                            // request, so letting a second start would re-enable
                                            // the first card's button while it's still copying.
                                            disabled={copyingId !== null}
                                        >
                                            {copyingId === drawing.id ? 'Copying...' : 'Copy'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(drawing.id)}
                                            className={styles.deleteButton}
                                            disabled={deletingId === drawing.id}
                                        >
                                            {deletingId === drawing.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    )
}

