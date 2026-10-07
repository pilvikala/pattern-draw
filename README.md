# Pattern Draw

A pixel art drawing app for creating patterns. Draw on a customizable matrix with different patterns, save colors, and share your creations via URL.

## Features

- Multiple matrix patterns (regular squares, interleaved/brick pattern)
- Customizable pixel size
- Color picker and saved color palette
- Click/tap to draw
- Layers, including freehand layers for drawing smooth lines by hand
- Save to local storage
- Share drawings via URL
- Download/print functionality
- User authentication (Google OAuth and email/password)
- User accounts for saving patterns
- Analytics and session replay with PostHog (optional)

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
DATABASE_URL="postgresql://user:password@localhost:5432/pattern_draw?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
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
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy the Client ID and Client Secret to your `.env` file

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
2. Update `NEXTAUTH_URL` to your production domain
3. Update Google OAuth redirect URI to your production domain
4. Run database migrations on your production database


