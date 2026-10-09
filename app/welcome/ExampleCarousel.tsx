'use client'

import { useEffect, useState } from 'react'
import type { Example } from './content'
import styles from './page.module.css'

const ROTATE_MS = 6000

export function ExampleCarousel({ examples }: { examples: Example[] }) {
  const [current, setCurrent] = useState(0)
  const [autoRotate, setAutoRotate] = useState(true)

  useEffect(() => {
    if (!autoRotate || examples.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setCurrent((i) => (i + 1) % examples.length), ROTATE_MS)
    return () => clearInterval(timer)
  }, [autoRotate, examples.length])

  // Picking an example by hand stops the rotation.
  const go = (i: number) => {
    setAutoRotate(false)
    setCurrent((i + examples.length) % examples.length)
  }

  const example = examples[current]

  return (
    <div className={styles.carousel}>
      <div className={styles.carouselImages}>
        <figure className={styles.carouselFigure}>
          <figcaption className={styles.carouselLabel}>The pattern</figcaption>
          {example.patternSrc ? (
            <img src={example.patternSrc} alt={example.patternAlt} className={styles.carouselImage} />
          ) : (
            <div className={`${styles.carouselPlaceholder} ${styles.carouselPlaceholderGrid}`}>[Kuvio pattern screenshot]</div>
          )}
        </figure>
        <figure className={styles.carouselFigure}>
          <figcaption className={styles.carouselLabel}>The finished piece</figcaption>
          {example.photoSrc ? (
            <img src={example.photoSrc} alt={example.photoAlt} className={styles.carouselImage} />
          ) : (
            <div className={styles.carouselPlaceholder}>[Photo of the finished piece]</div>
          )}
        </figure>
      </div>
      <div className={styles.carouselCaption}>
        <div className={styles.carouselTitle}>{example.title}</div>
        <div className={styles.carouselMeta}>{example.meta}</div>
      </div>
      {examples.length > 1 && (
        <div className={styles.carouselControls}>
          <div className={styles.carouselDots}>
            {examples.map((e, i) => (
              <button
                key={i}
                type="button"
                className={styles.carouselDot}
                aria-label={`Show example ${i + 1}`}
                aria-current={i === current}
                onClick={() => go(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <div className={styles.carouselArrows}>
            <button type="button" className={styles.carouselArrow} aria-label="Previous example" onClick={() => go(current - 1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button type="button" className={styles.carouselArrow} aria-label="Next example" onClick={() => go(current + 1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
