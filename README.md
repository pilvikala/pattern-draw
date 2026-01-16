# Pattern Draw

A pixel art drawing app for creating patterns. Draw on a customizable matrix with different patterns, save colors, and share your creations via URL.

## Features

- Multiple matrix patterns (regular squares, interleaved/brick pattern)
- Customizable pixel size
- Color picker and saved color palette
- Click/tap to draw
- Save to local storage
- Share drawings via URL
- Download/print functionality
- User authentication (Google OAuth and email/password)
- User accounts for saving patterns
- Analytics and session replay with PostHog (optional)

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


