import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeDrawing, deserializeDrawing } from '@/lib/serialization'
import type { DrawingData } from '@/lib/types'

// GET /api/drawings/[id] - Load a specific drawing
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const drawing = await prisma.drawing.findUnique({
            where: {
                id: params.id,
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
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { drawingData } = body

        if (!drawingData) {
            return NextResponse.json(
                { error: 'Drawing data is required' },
                { status: 400 }
            )
        }

        // Check if drawing exists and user owns it
        const existingDrawing = await prisma.drawing.findUnique({
            where: {
                id: params.id,
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

        // Serialize the drawing data
        const serialized = serializeDrawing(drawingData as DrawingData)

        const drawing = await prisma.drawing.update({
            where: {
                id: params.id,
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
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Check if drawing exists and user owns it
        const existingDrawing = await prisma.drawing.findUnique({
            where: {
                id: params.id,
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
                id: params.id,
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

