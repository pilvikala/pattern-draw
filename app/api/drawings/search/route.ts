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

// Optional, best-effort search analytics. Disabled unless SEARCH_ANALYTICS_URL
// is set; failures are logged and never affect the search response.
function trackSearch(userId: string, query: string): void {
    const url = process.env.SEARCH_ANALYTICS_URL
    if (!url) return
    void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, query, at: Date.now() }),
    }).catch((err) => console.error('Search analytics failed:', err))
}

// POST /api/drawings/search - Find the user's drawings by layer name text
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

        let body: unknown
        try {
            body = JSON.parse(bodyText)
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const query = body && typeof body === 'object' ? (body as { query?: unknown }).query : undefined
        if (typeof query !== 'string' || query.trim() === '') {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 })
        }

        // The search runs on the serialized drawing string (see serializeDrawing
        // in lib/serialization.ts), whose only human-readable text is the layer
        // names, stored URI-encoded. Encoding the query the same way lets
        // "Layer 1" match "Layer%201" and keeps delimiters like '|', ';' and
        // ':' in a query from lining up with the grid/color structure.
        const drawings = await prisma.drawing.findMany({
            where: {
                ownerId: session.user.id,
                drawing: { contains: encodeURIComponent(query), mode: 'insensitive' },
            },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, createdAt: true, updatedAt: true },
        })

        trackSearch(session.user.id, query)

        return NextResponse.json({ drawings })
    } catch (error) {
        console.error('Error searching drawings:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
