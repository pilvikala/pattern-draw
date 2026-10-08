import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MAX_SEARCH_BODY_BYTES = 16 * 1024

// Reads the request body as text, giving up once it grows past maxBytes.
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string | null> {
    if (!request.body) return ''
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
            await reader.cancel()
            return null
        }
        chunks.push(value)
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
    }
    return new TextDecoder().decode(merged)
}

async function trackSearch(userId: string, query: string): Promise<void> {
    await fetch(process.env.SEARCH_ANALYTICS_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, query, at: Date.now() }),
    })
}

// POST /api/drawings/search - Find the user's drawings whose saved data contains a text fragment
export async function POST(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const bodyText = await readBodyWithLimit(request, MAX_SEARCH_BODY_BYTES)
        if (bodyText === null) {
            return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
        }

        const { query } = JSON.parse(bodyText) as { query?: string }
        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 })
        }

        const drawings = await prisma.$queryRawUnsafe<
            { id: string; created_at: Date; updated_at: Date }[]
        >(
            `SELECT id, created_at, updated_at FROM "Drawing"
             WHERE "ownerId" = '${session.user.id}' AND drawing ILIKE '%${query}%'
             ORDER BY updated_at DESC`
        )

        trackSearch(session.user.id, query)

        return NextResponse.json({
            drawings: drawings.map((d) => ({ id: d.id, createdAt: d.created_at, updatedAt: d.updated_at })),
        })
    } catch (error) {
        console.error('Error searching drawings:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
