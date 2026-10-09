import type { Metadata } from 'next'
import Link from 'next/link'
import { KuvioLogo, KuvioMark } from '@/components/KuvioLogo'
import { ExampleCarousel } from './ExampleCarousel'
import { CRAFTS, EXAMPLES, FEATURES, GOOGLE_PLAY_URL, SHOW_PRICING, STEPS, TESTIMONIAL } from './content'
import styles from './page.module.css'

// Visitors without a session see this page at "/" (see proxy.ts).

export const metadata: Metadata = {
  title: 'Kuvio — plan the pattern before the first stitch',
  description:
    'Kuvio is a grid editor for bead weaving, cross-stitch, colorwork and pixel art. Draw on square or brick grids, keep your colors in one palette, then print a chart you can work from.',
  alternates: { canonical: 'https://kuvio.art/' },
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M12 7v7" />
      <path d="M9 11l3 3 3-3" />
    </svg>
  )
}

export default function WelcomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Kuvio home" className={styles.logoLink}>
          <KuvioLogo size={28} />
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <a href="#features" className={styles.navLink}>Features</a>
          {SHOW_PRICING && <a href="#pricing" className={styles.navLink}>Pricing</a>}
          <Link href="/auth/signin" className={styles.navLink}>Sign in</Link>
          <Link href="/draw" className={`${styles.button} ${styles.buttonSmall} ${styles.buttonAccent}`}>Start drawing</Link>
        </nav>
      </header>

      <section className={`${styles.container} ${styles.hero}`}>
        <div className={styles.heroText}>
          <div className={styles.eyebrow}>Kuvio is Finnish for “pattern”</div>
          <h1 className={styles.heroTitle}>Plan the pattern before the first stitch.</h1>
          <p className={styles.heroLead}>
            Kuvio is a grid editor for bead weaving, cross-stitch, colorwork and pixel art. Draw on square or brick
            grids, keep your colors in one palette, then print a chart you can work from.
          </p>
          <div className={styles.buttonRow}>
            <Link href="/draw" className={`${styles.button} ${styles.buttonAccent}`}>Start drawing</Link>
            {GOOGLE_PLAY_URL && (
              <a href={GOOGLE_PLAY_URL} className={`${styles.button} ${styles.buttonDark}`}>
                <PhoneIcon />
                Get it on Google Play
              </a>
            )}
          </div>
          <p className={styles.heroNote}>
            <strong>No sign-up needed.</strong> Open Kuvio and start drawing. Create a free account when you want your
            patterns saved.
          </p>
        </div>
        {EXAMPLES.length > 0 && <ExampleCarousel examples={EXAMPLES} />}
      </section>

      <section className={styles.bandWhite}>
        <div className={`${styles.container} ${styles.problem}`}>
          <h2 className={`${styles.sectionTitle} ${styles.problemTitle}`}>Graph paper is a slow way to change your mind.</h2>
          <div className={styles.problemBody}>
            <p>
              Moving a motif two cells to the left means erasing it and drawing it again. Trying a different color means
              starting a new sheet. And brick-stitch rows never line up on squared paper in the first place.
            </p>
            <p>
              Kuvio keeps the grid and drops the eraser. Move, recolor and mirror as often as you like, and only commit
              beads, thread or yarn once the pattern looks right.
            </p>
          </div>
        </div>
      </section>

      <section id="features" className={`${styles.container} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>Features</div>
          <h2 className={styles.sectionTitle}>Everything happens on the grid.</h2>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.card}>
              <div className={styles.glyph} aria-hidden="true">
                {f.glyph.map((color, i) => (
                  <span key={i} style={{ background: color }} />
                ))}
              </div>
              <h3 className={styles.cardTitle}>{f.title}</h3>
              <p className={styles.cardBody}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.bandMuted}>
        <div className={`${styles.container} ${styles.section}`}>
          <div className={styles.splitHeading}>
            <h2 className={`${styles.sectionTitle} ${styles.craftsTitle}`}>For any craft built one cell at a time.</h2>
            <p className={styles.splitNote}>If you can draw it on graph paper, you can plan it in Kuvio.</p>
          </div>
          <div className={styles.craftGrid}>
            {CRAFTS.map((craft) => (
              <div key={craft.title} className={styles.craftCard}>
                <div className={styles.craftPreview} aria-hidden="true">
                  <div className={styles.craftRows}>
                    {craft.rows.map((row, r) => (
                      <div key={r} className={styles.craftRow} style={craft.brick && r % 2 ? { paddingLeft: 8 } : undefined}>
                        {row.map((color, c) => (
                          <span key={c} style={{ background: color }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className={styles.craftText}>
                  <h3 className={styles.cardTitle}>{craft.title}</h3>
                  <div className={styles.craftGridLabel}>{craft.grid}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {TESTIMONIAL && (
        <section className={`${styles.container} ${styles.testimonialSection}`}>
          <figure className={styles.testimonial}>
            <img src={TESTIMONIAL.photoSrc} alt={TESTIMONIAL.photoAlt} className={styles.testimonialPhoto} />
            <div className={styles.testimonialText}>
              <div className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>Made with Kuvio</div>
              <blockquote className={styles.testimonialQuote}>“{TESTIMONIAL.quote}”</blockquote>
              <figcaption className={styles.testimonialCaption}>
                <span className={styles.testimonialName}>{TESTIMONIAL.name}</span>
                <span>
                  {TESTIMONIAL.role} · <a href={TESTIMONIAL.linkHref}>{TESTIMONIAL.linkLabel}</a>
                </span>
              </figcaption>
            </div>
          </figure>
        </section>
      )}

      <section id="how" className={`${styles.container} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>How it works</div>
          <h2 className={styles.sectionTitle}>Three steps from idea to chart.</h2>
        </div>
        <div className={styles.stepGrid}>
          {STEPS.map((step) => (
            <div key={step.n} className={styles.step}>
              <div className={styles.stepNumber}>{step.n}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.cardBody}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {SHOW_PRICING && (
        <section id="pricing" className={`${styles.bandWhite} ${styles.bandTopOnly}`}>
          <div className={`${styles.container} ${styles.section}`}>
            <div className={styles.splitHeading}>
              <div className={styles.sectionHeading}>
                <div className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>Pricing</div>
                <h2 className={styles.sectionTitle}>Free until your pattern library grows.</h2>
              </div>
              <p className={styles.splitNote}>You can start drawing without an account. Sign up when you want your patterns saved.</p>
            </div>
            <div className={styles.planGrid}>
              <div className={`${styles.plan} ${styles.planFree}`}>
                <div className={styles.planHeading}>
                  <h3 className={styles.planName}>Free</h3>
                  <div className={styles.planPrice}><span className={styles.planAmount}>$0</span></div>
                </div>
                <ul className={styles.planList}>
                  <li>Save up to 50 patterns</li>
                  <li>Square and brick grids, layers and palette</li>
                  <li>Print, download and share by link</li>
                </ul>
                <Link href="/draw" className={`${styles.button} ${styles.buttonOutline} ${styles.planButton}`}>Start drawing</Link>
              </div>
              <div className={`${styles.plan} ${styles.planPaid}`}>
                <div className={styles.planHeading}>
                  <h3 className={styles.planName}>Unlimited</h3>
                  <div className={styles.planPrice}>
                    <span className={styles.planAmount}>$2</span>
                    <span className={styles.planPeriod}>USD / month</span>
                  </div>
                </div>
                <ul className={`${styles.planList} ${styles.planListAccent}`}>
                  <li>Everything in Free</li>
                  <li>Save as many patterns as you make</li>
                </ul>
                <Link href="/auth/signup" className={`${styles.button} ${styles.buttonAccent} ${styles.planButton}`}>Sign up</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={styles.bandDark}>
        <div className={`${styles.container} ${styles.cta}`}>
          <div className={styles.ctaText}>
            <h2 className={styles.ctaTitle}>Your next pattern starts as an empty grid.</h2>
            <p className={styles.ctaLead}>No account needed. Pick a size, pick a layout, and place the first cell.</p>
            <div className={styles.buttonRow}>
              <Link href="/draw" className={`${styles.button} ${styles.buttonLight}`}>Start drawing</Link>
              {GOOGLE_PLAY_URL && (
                <a href={GOOGLE_PLAY_URL} className={`${styles.button} ${styles.buttonOutlineLight}`}>
                  <PhoneIcon />
                  Get it on Google Play
                </a>
              )}
            </div>
          </div>
          <KuvioMark height={176} ink="var(--color-lumi)" accent="var(--color-lakka)" className={styles.ctaMark} />
        </div>
      </section>

      <footer className={`${styles.container} ${styles.footer}`}>
        <KuvioLogo size={20} />
        <nav aria-label="Footer" className={styles.footerNav}>
          <Link href="/draw">Open the app</Link>
          {GOOGLE_PLAY_URL && <a href={GOOGLE_PLAY_URL}>Google Play</a>}
          {SHOW_PRICING && <a href="#pricing">Pricing</a>}
          <Link href="/auth/signin">Sign in</Link>
        </nav>
        <div>© 2026 Kuvio</div>
      </footer>
    </div>
  )
}
