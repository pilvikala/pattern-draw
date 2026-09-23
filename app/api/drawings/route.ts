import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeDrawing, MAX_COMPACT_STRING_LENGTH, readBoundedRequestBody } from '@/lib/serialization'
import { normalizeDrawingData, totalGridEntryCount, MAX_TOTAL_GRID_ENTRIES } from '@/lib/layers'

// GET /api/drawings - List all drawings for the authenticated user
export async function GET(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const drawings = await prisma.drawing.findMany({
            where: {
                ownerId: session.user.id,
            },
            orderBy: {
                updatedAt: 'desc',
            },
            select: {
                id: true,
                createdAt: true,
                updatedAt: true,
                drawing: true,
            },
        })

        return NextResponse.json({ drawings })
    } catch (error) {
        console.error('Error fetching drawings:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// POST /api/drawings - Create a new drawing
export async function POST(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Read the body with a byte budget before parsing it as JSON -
        // request.json() would buffer and parse the entire client-supplied
        // body in memory regardless of size, unprotected by any bound
        // downstream (normalizeDrawingData included).
        const bodyText = await readBoundedRequestBody(request)
        if (bodyText === null) {
            return NextResponse.json(
                { error: 'Request body is too large' },
                { status: 413 }
            )
        }

        let body: unknown
        try {
            body = JSON.parse(bodyText)
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400 }
            )
        }

        const { drawingData } = (body && typeof body === 'object' ? body : {}) as { drawingData?: unknown }

        // normalizeDrawingData treats any non-object (a string, number,
        // array, etc.) as "no data" and falls back to a blank drawing
        // rather than rejecting it - a truthy-but-wrong-shaped drawingData
        // (e.g. `{ drawingData: "bad" }`) would otherwise pass this check
        // and silently create an empty drawing instead of returning 400.
        if (!drawingData || typeof drawingData !== 'object' || Array.isArray(drawingData)) {
            return NextResponse.json(
                { error: 'Drawing data is required' },
                { status: 400 }
            )
        }

        // Normalize before serializing - drawingData is client-supplied JSON
        // cast with no runtime validation; without this an authenticated
        // user could POST a crafted payload (huge canvas, thousands of
        // layers, out-of-bounds grid entries) that serializeDrawing would
        // faithfully encode into the stored string, which every later load
        // of this drawing (including this same user's own drawings list
        // and the GET route) would then have to parse back out.
        const normalized = normalizeDrawingData(drawingData)

        // Cheap aggregate-size preflight before the expensive serialization
        // work below - see MAX_TOTAL_GRID_ENTRIES's comment.
        if (totalGridEntryCount(normalized) > MAX_TOTAL_GRID_ENTRIES) {
            return NextResponse.json(
                { error: 'Drawing is too large to save' },
                { status: 400 }
            )
        }

        const serialized = serializeDrawing(normalized)

        // normalizeDrawingData bounds each layer's grid independently, but
        // not the aggregate across all layers combined - many large-but-
        // individually-valid layers can still serialize past what
        // deserializeDrawing will later agree to parse back (see
        // MAX_COMPACT_STRING_LENGTH's comment). Reject here rather than
        // saving a drawing that can never be loaded again.
        if (serialized.length > MAX_COMPACT_STRING_LENGTH) {
            return NextResponse.json(
                { error: 'Drawing is too large to save' },
                { status: 400 }
            )
        }

        const drawing = await prisma.drawing.create({
            data: {
                ownerId: session.user.id,
                drawing: serialized,
            },
            select: {
                id: true,
                createdAt: true,
                updatedAt: true,
            },
        })

        return NextResponse.json({ drawing }, { status: 201 })
    } catch (error) {
        console.error('Error creating drawing:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

