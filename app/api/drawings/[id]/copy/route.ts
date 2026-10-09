import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/drawings/[id]/copy - Create a copy of a drawing
export async function POST(
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
        const source = await prisma.drawing.findUnique({
            where: {
                id,
            },
            select: {
                ownerId: true,
                drawing: true,
            },
        })

        if (!source) {
            return NextResponse.json(
                { error: 'Drawing not found' },
                { status: 404 }
            )
        }

        if (source.ownerId !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            )
        }

        // The stored string was already normalized and size-checked when it
        // was saved (see the POST/PUT routes), so it's duplicated verbatim
        // rather than round-tripped through the client.
        const drawing = await prisma.drawing.create({
            data: {
                ownerId: session.user.id,
                drawing: source.drawing,
            },
            select: {
                id: true,
                createdAt: true,
                updatedAt: true,
                drawing: true,
            },
        })

        return NextResponse.json({ drawing }, { status: 201 })
    } catch (error) {
        console.error('Error copying drawing:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
