<img src="public/kuvio-logo.svg" alt="" height="48">

# Kuvio

*kuvio* — Finnish for "pattern". A pixel art drawing app for creating patterns. Draw on a customizable matrix with different patterns, save colors, and share your creations via URL.

## Features

- Multiple matrix patterns (regular squares, interleaved/brick pattern)
- Customizable pixel size
- Color picker and saved color palette
- Click/tap to draw
- Layers, including freehand layers for drawing smooth lines by hand
- Select tool with add/subtract selection for any shape (see below)
- Save to local storage
- Share drawings via URL
- Download/print functionality
- User authentication (Google OAuth and email/password)
- User accounts for saving patterns
- Analytics and session replay with PostHog (optional)

## Selecting

The select tool (**S**) selects a rectangle by dragging; dragging inside the selection moves it. The selection can be copied, cut, pasted, mirrored and deleted.

To select other shapes, add rectangles to the selection or cut them out of it:

- **On desktop**, hold **Shift** while dragging to add and **Alt** (Option on a Mac) to subtract.
- **On any screen**, including touch screens, pick **New**, **Add** or **Subtract** with the buttons that appear next to the select tool. The chosen mode stays on until you pick another, so several areas can be added or cut out in a row. In Add and Subtract mode a drag always draws a marquee, so switch back to New to move the selection.

Copying a shaped selection keeps its shape: pasting it overwrites only the cells that were selected and leaves the rest of the area as it was. Mirroring flips the selection's contents across the middle of its bounding box, and the selection flips with them.

## Freehand Layers

Besides pixel layers, a drawing can have freehand layers (**+ Freehand** in the layers panel). On one, the pencil draws smooth lines in the selected color, and the line width is set from the menu next to the pencil (or with `[` and `]`). Widths are measured in grid cells, so a line keeps its proportions when the pixel size changes.

- **Eraser** removes whole strokes it touches.
- **Select** works on the strokes inside the selected area: move, copy, cut, paste, mirror and delete. Strokes are cut at the edge of the selection. Strokes and pixels can't be pasted onto each other's layers.
- **Color picker** reads stroke colors too.
- **Fill** is not available on a freehand layer, and a freehand layer can only be merged down into another freehand layer.
- Freehand layers can sit anywhere in the stack; layers above one are drawn over the grid on a canvas so the stacking order stays correct. Downloads and the saved-drawings previews include them.

### Saved format

Existing drawings are unaffected: pixel layers serialize exactly as before, so everything saved or shared by an earlier version still loads, and a drawing without freehand layers produces the same compact string it always did.

A freehand layer is stored in the same compact `v2` string as any other layer (three `|`-separated fields: name, visibility, content), with content `~;stroke;stroke;...`. The leading `~` marks the layer type and is present even when the layer has no strokes. Each stroke is `colorIndex,width,x0,y0,dx1,dy1,...`: an index into the drawing's shared color palette, then integers in hundredths of a grid cell (the line width, the first point, and each later point as an offset from the previous one). Because stroke entries contain no `:`, an older client that doesn't know about freehand layers skips them and shows an empty layer instead of failing to load the drawing. In JSON (local storage and the save API) a freehand layer is `{ ..., "type": "freehand", "strokes": [{ "color", "width", "points": [x0, y0, x1, y1, ...] }] }`; pixel layers have no `type` field. The format is documented in `lib/serialization.ts` and the limits on strokes in `lib/strokes.ts`.

## Routes

`/` shows the editor to signed-in users and the marketing page (`app/welcome`) to everyone else, without changing the URL. `proxy.ts` makes the call: a visitor with an Auth.js session cookie, or one opening a drawing (`/?drawing=…` or `/?id=…`), gets the editor. The editor is also always at `/draw`, which is where the marketing page's "Start drawing" links go.

The marketing page content lives in `app/welcome/content.ts`: the hero carousel shows placeholders until its images are set, and the Google Play link and testimonial stay hidden until they are filled in.

## Getting Started

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local or cloud)

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/kuvio?schema=public"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here-generate-with-openssl-rand-base64-32"

# Google OAuth (optional, for Google sign-in)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# PostHog (optional, for analytics and session replay)
NEXT_PUBLIC_POSTHOG_KEY="your-posthog-project-api-key"
NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
```

To generate a secure `NEXTAUTH_SECRET`, run:
```bash
openssl rand -base64 32
```

3. **Set up the database:**
```bash
# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init
```

4. **Start the development server:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Google OAuth Setup (Optional)

To enable Google sign-in:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Add an authorized redirect URI for **every** domain the app is served from, e.g.:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-domain.com/api/auth/callback/google`
   - `https://www.your-other-domain.com/api/auth/callback/google`
6. Copy the Client ID and Client Secret to your `.env` file

#### Multiple domains

Sign-in works on any domain the app is reachable from: when no fixed URL is configured,
Auth.js derives the auth URL from the incoming request's `Host` / `X-Forwarded-Host` header.
Auth.js trusts the host automatically on Vercel and in development. A self-hosted production
deployment behind a reverse proxy that sets `X-Forwarded-Host` needs `AUTH_TRUST_HOST=true`
(only do this when the proxy overwrites that header, otherwise clients can spoof it).
For this to work:

- **Do not set `NEXTAUTH_URL` (or `AUTH_URL`).** If either is set, all sign-ins are forced
  onto that single origin.
- Register `https://<domain>/api/auth/callback/google` for each domain in the Google OAuth
  client (Google does not accept wildcards, so ephemeral preview URLs need to be added
  individually or won't support Google sign-in).
- Sessions are per-domain: signing in on one domain does not sign you in on another.

### PostHog Setup (Optional)

To enable analytics and session replay:

1. Sign up for a free account at [PostHog](https://posthog.com/)
2. Create a new project
3. Copy your Project API Key from the project settings
4. Add the following to your `.env` file:
   - `NEXT_PUBLIC_POSTHOG_KEY` - Your PostHog project API key
   - `NEXT_PUBLIC_POSTHOG_HOST` - Your PostHog host (default: `https://us.i.posthog.com`)

PostHog will automatically:
- Track pageviews
- Record user sessions for replay
- Identify users when they sign in
- Track custom events throughout your app

## Database Management

### View database in Prisma Studio:
```bash
npx prisma studio
```

### Reset database (development only):
```bash
npx prisma migrate reset
```

## Deploy to Vercel

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new).

Make sure to:
1. Set all environment variables in Vercel dashboard
2. Leave `NEXTAUTH_URL` unset (see [Multiple domains](#multiple-domains))
3. Add a Google OAuth redirect URI for each production domain
4. Run database migrations on your production database

## Brand

Colors and type follow the Kuvio brand guide. The tokens live in `app/globals.css`:

| Token | Name | Hex | Use |
| --- | --- | --- | --- |
| `--color-lumi` | Lumi (snow) | `#F3F2EE` | Page ground |
| `--color-yo` | Yö (night) | `#1B1F2A` | Text, the mark, dark sections |
| `--color-puolukka` | Puolukka (lingonberry) | `#C8324A` | The one accent: buttons, links |
| `--color-lakka` | Lakka (cloudberry) | `#E89A2C` | Fills and highlights only, never text |
| `--color-jaa` | Jää (ice) | `#2F5DA8` | Patterns, illustrations, info states |
| `--color-kivi` | Kivi (stone) | `#6B6F78` | Secondary text, captions, grid lines |

Typefaces (loaded with `next/font/google`): Bricolage Grotesque for display, Instrument Sans for text, DM Mono for data. The logo is `components/KuvioLogo.tsx`; the favicon is `app/icon.svg`.
