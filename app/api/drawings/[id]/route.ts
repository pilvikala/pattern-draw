import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeDrawing, deserializeDrawing, MAX_COMPACT_STRING_LENGTH, readBoundedRequestBody } from '@/lib/serialization'
import { normalizeDrawingData, totalGridEntryCount, MAX_TOTAL_GRID_ENTRIES } from '@/lib/layers'

// GET /api/drawings/[id] - Load a specific drawing
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params
        const drawing = await prisma.drawing.findUnique({
            where: {
                id,
            },
            select: {
                id: true,
                ownerId: true,
                drawing: true,
                createdAt: true,
                updatedAt: true,
            },
        })

        if (!drawing) {
            return NextResponse.json(
                { error: 'Drawing not found' },
                { status: 404 }
            )
        }

        // Check if user owns this drawing
        if (drawing.ownerId !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            )
        }

        // Deserialize the drawing data
        const drawingData = deserializeDrawing(drawing.drawing)

        if (!drawingData) {
            return NextResponse.json(
                { error: 'Invalid drawing data' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            id: drawing.id,
            drawingData,
            createdAt: drawing.createdAt,
            updatedAt: drawing.updatedAt,
        })
    } catch (error) {
        console.error('Error loading drawing:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// PUT /api/drawings/[id] - Update a drawing
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Read the body with a byte budget before parsing it as JSON - see
        // the identical comment in app/api/drawings/route.ts's POST handler.
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
        // and silently overwrite the existing saved drawing with an empty
        // one instead of returning 400.
        if (!drawingData || typeof drawingData !== 'object' || Array.isArray(drawingData)) {
            return NextResponse.json(
                { error: 'Drawing data is required' },
                { status: 400 }
            )
        }

        // Check if drawing exists and user owns it
        const existingDrawing = await prisma.drawing.findUnique({
            where: {
                id,
            },
            select: {
                ownerId: true,
            },
        })

        if (!existingDrawing) {
            return NextResponse.json(
                { error: 'Drawing not found' },
                { status: 404 }
            )
        }

        if (existingDrawing.ownerId !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            )
        }

        // Normalize before serializing - see the POST route in
        // app/api/drawings/route.ts for why this can't be skipped.
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

        // Same aggregate-size guard as the POST route - see
        // MAX_COMPACT_STRING_LENGTH's comment for why per-layer bounds alone
        // aren't enough to guarantee a save stays loadable.
        if (serialized.length > MAX_COMPACT_STRING_LENGTH) {
            return NextResponse.json(
                { error: 'Drawing is too large to save' },
                { status: 400 }
            )
        }

        const drawing = await prisma.drawing.update({
            where: {
                id,
            },
            data: {
                drawing: serialized,
            },
            select: {
                id: true,
                createdAt: true,
                updatedAt: true,
            },
        })

        return NextResponse.json({ drawing })
    } catch (error) {
        console.error('Error updating drawing:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// DELETE /api/drawings/[id] - Delete a drawing
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params
        // Check if drawing exists and user owns it
        const existingDrawing = await prisma.drawing.findUnique({
            where: {
                id,
            },
            select: {
                ownerId: true,
            },
        })

        if (!existingDrawing) {
            return NextResponse.json(
                { error: 'Drawing not found' },
                { status: 404 }
            )
        }

        if (existingDrawing.ownerId !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            )
        }

        await prisma.drawing.delete({
            where: {
                id,
            },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting drawing:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

