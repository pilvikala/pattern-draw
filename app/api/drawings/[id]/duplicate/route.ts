import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeDrawing, deserializeDrawing } from '@/lib/serialization'
import { MAX_TOTAL_GRID_ENTRIES, totalGridEntryCount } from '@/lib/layers'

// POST /api/drawings/[id]/duplicate - Copy a drawing into a new one owned by the current user
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        // Only the owner may duplicate a drawing. Scoping the lookup to the
        // owner (and answering 404 otherwise) also avoids confirming that
        // other users' drawing ids exist.
        const source = await prisma.drawing.findFirst({
            where: { id, ownerId: session.user.id },
            select: { drawing: true },
        })

        if (!source) {
            return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
        }

        const data = deserializeDrawing(source.drawing)

        if (!data) {
            return NextResponse.json({ error: 'Invalid drawing data' }, { status: 500 })
        }

        if (totalGridEntryCount(data) > MAX_TOTAL_GRID_ENTRIES) {
            return NextResponse.json({ error: 'Drawing is too large to duplicate' }, { status: 400 })
        }

        const copy = await prisma.drawing.create({
            data: {
                ownerId: session.user.id,
                drawing: serializeDrawing(data),
            },
            select: { id: true, createdAt: true, updatedAt: true },
        })

        return NextResponse.json({ drawing: copy }, { status: 201 })
    } catch (error) {
        console.error('Error duplicating drawing:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
