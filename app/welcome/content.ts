// Content for the marketing page (app/welcome). The Google Play links, the
// testimonial and pricing stay hidden until they are filled in; the hero
// carousel shows placeholders until its images are added.

const BG = '#E6E3DB'
const YO = '#1B1F2A'
const PUOLUKKA = '#C8324A'
const LAKKA = '#E89A2C'
const JAA = '#2F5DA8'

// Link to the Android app. Both "Get it on Google Play" buttons and the footer
// link are hidden while this is null.
export const GOOGLE_PLAY_URL: string | null = null

// The pricing section and its nav links are hidden while this is false. Turn it
// on once the 50-pattern limit and the paid plan exist in the app.
export const SHOW_PRICING = false

export interface Example {
  title: string
  meta: string
  patternSrc: string
  patternAlt: string
  photoSrc: string
  photoAlt: string
}

// The hero carousel: a pattern in Kuvio next to a photo of the finished piece.
// Images go in public/ (e.g. '/examples/earrings-pattern.png'); an empty src
// shows a placeholder box in its place.
export const EXAMPLES: Example[] = [
  { title: '[Pattern name]', meta: 'Seed-bead earrings · brick grid · [maker]', patternSrc: '', patternAlt: 'Earring pattern in Kuvio', photoSrc: '', photoAlt: 'Finished seed-bead earrings' },
  { title: '[Pattern name]', meta: 'Cross-stitch · square grid · [maker]', patternSrc: '', patternAlt: 'Cross-stitch pattern in Kuvio', photoSrc: '', photoAlt: 'Finished cross-stitch' },
  { title: '[Pattern name]', meta: 'Colorwork knitting · square grid · [maker]', patternSrc: '', patternAlt: 'Knitting chart in Kuvio', photoSrc: '', photoAlt: 'Finished knitted piece' },
  { title: '[Pattern name]', meta: 'Bead loom bracelet · square grid · [maker]', patternSrc: '', patternAlt: 'Bracelet pattern in Kuvio', photoSrc: '', photoAlt: 'Finished bead loom bracelet' },
]

export interface Testimonial {
  quote: string
  name: string
  role: string
  linkLabel: string
  linkHref: string
  photoSrc: string
  photoAlt: string
}

// The "Made with Kuvio" quote. Hidden while null; drafted as:
//   { quote: '[A sentence or two from Oarri on how they use Kuvio to plan their beadwork.]',
//     name: 'Oarri', role: 'Handmade jewelry and seed-bead earrings',
//     linkLabel: 'oarri.fi', linkHref: 'https://oarri.fi',
//     photoSrc: '[Photo of Oarri seed-bead earrings]', photoAlt: 'Seed-bead earrings by Oarri' }
export const TESTIMONIAL: Testimonial | null = null

export interface Feature {
  title: string
  body: string
  // A 3 x 3 icon, one color per cell, row by row.
  glyph: string[]
}

const glyph = (cells: number[], color: string) => cells.map((v) => (v ? color : BG))

export const FEATURES: Feature[] = [
  {
    title: 'Square or brick grids',
    body: 'Switch between a regular grid and an offset brick layout, and set the cell size to match your beads or stitches.',
    glyph: glyph([1, 1, 1, 0, 1, 1, 1, 1, 1], YO),
  },
  {
    title: 'One palette per pattern',
    body: 'Pick colors, save the ones you use, and reach for them again anywhere in the design.',
    glyph: [PUOLUKKA, LAKKA, JAA, YO, PUOLUKKA, LAKKA, JAA, YO, PUOLUKKA],
  },
  {
    title: 'Layers',
    body: 'Keep the motif, the border and the background apart. Hide a layer to see what sits underneath.',
    glyph: glyph([1, 1, 0, 1, 1, 1, 0, 1, 1], JAA),
  },
  {
    title: 'Freehand sketch layers',
    body: 'Rough out a shape with smooth pencil lines first, then fill in the cells below it.',
    glyph: glyph([0, 0, 1, 0, 1, 0, 1, 0, 0], PUOLUKKA),
  },
  {
    title: 'Fill, select and mirror',
    body: 'Flood an area with one click, copy a motif to a new spot, or mirror it to build a symmetric design.',
    glyph: glyph([1, 0, 1, 1, 0, 1, 1, 0, 1], LAKKA),
  },
  {
    title: 'Print, download or share',
    body: 'Print the chart for your work table, download it, or send a link that opens the pattern as you left it.',
    glyph: glyph([1, 1, 1, 1, 0, 1, 1, 1, 1], YO),
  },
]

export interface Craft {
  title: string
  grid: string
  brick: boolean
  // 6 rows of 10 cell colors.
  rows: string[][]
}

const cells = (fn: (r: number, c: number) => string) =>
  Array.from({ length: 6 }, (_, r) => Array.from({ length: 10 }, (_, c) => fn(r, c)))

export const CRAFTS: Craft[] = [
  {
    title: 'Bead weaving',
    grid: 'Brick grid',
    brick: true,
    rows: cells((r, c) => {
      const k = (((c * 2 + (r % 2) - r) % 6) + 6) % 6
      return k < 2 ? PUOLUKKA : k < 4 ? LAKKA : BG
    }),
  },
  {
    title: 'Cross-stitch',
    grid: 'Square grid',
    brick: false,
    rows: cells((r, c) => (c - 2 === r || 7 - c === r ? PUOLUKKA : BG)),
  },
  {
    title: 'Colorwork knitting',
    grid: 'Square grid',
    brick: false,
    rows: cells((r, c) => {
      const z = c % 4
      const h = z <= 2 ? z : 4 - z
      if (r === h + 1) return YO
      if (r === h + 2) return LAKKA
      return BG
    }),
  },
  {
    title: 'Pixel art',
    grid: 'Square grid',
    brick: false,
    rows: cells((r, c) => {
      const d = Math.abs(c - 4.5) + Math.abs(r - 2.5)
      return d <= 1.5 ? LAKKA : d <= 3 ? JAA : BG
    }),
  },
]

export const STEPS = [
  {
    n: '01',
    title: 'Open and draw',
    body: 'No account, no setup. Pick a square or brick layout and the size of each cell, then start placing cells.',
  },
  {
    n: '02',
    title: 'Adjust until it’s right',
    body: 'Use layers, fill and mirror, and undo whenever you change your mind.',
  },
  {
    n: '03',
    title: 'Take it to the table',
    body: 'Print the chart, keep it open on your phone, or sign up to save it with the rest of your patterns.',
  },
]
