import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeDrawing } from '@/lib/serialization'
import { normalizeDrawingData } from '@/lib/layers'

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

        const body = await request.json()
        const { drawingData } = body

        if (!drawingData) {
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
        const serialized = serializeDrawing(normalizeDrawingData(drawingData))

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

