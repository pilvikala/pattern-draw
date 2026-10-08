import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeDrawing, deserializeDrawing } from '@/lib/serialization'
import { MAX_TOTAL_GRID_ENTRIES } from '@/lib/layers'
import type { DrawingData } from '@/lib/types'

// Counts painted cells across all layers.
function countEntries(data: DrawingData): number {
    let count = 0
    for (const layer of data.layers) {
        count += Object.keys(layer.grid).length
    }
    return count
}

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
        const source = await prisma.drawing.findUnique({
            where: { id },
            select: { drawing: true },
        })

        if (!source) {
            return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
        }

        const data = deserializeDrawing(source.drawing)!

        if (countEntries(data) > MAX_TOTAL_GRID_ENTRIES) {
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
