import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { serializeDrawing } from '@/lib/serialization'
import type { DrawingData } from '@/lib/types'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    drawing: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}))

import { POST } from './route'

function drawing(overrides: Partial<DrawingData> = {}): DrawingData {
  return {
    pattern: 'squares',
    pixelSize: 15,
    canvasWidth: 20,
    canvasHeight: 20,
    colors: { '0': '#000000' },
    layers: [{ id: 'l1', name: 'Layer 1', visible: true, grid: { '0,0': '#000000' } }],
    activeLayerIndex: 0,
    ...overrides,
  }
}

function call(id: string) {
  const request = new NextRequest(`http://localhost/api/drawings/${id}/duplicate`, { method: 'POST' })
  return POST(request, { params: Promise.resolve({ id }) })
}

describe('POST /api/drawings/[id]/duplicate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.auth.mockResolvedValue({ user: { id: 'user-a' } })
  })

  it('returns 401 without a session', async () => {
    mocks.auth.mockResolvedValue(null)
    const res = await call('d1')
    expect(res.status).toBe(401)
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  it("scopes the lookup to the caller and returns 404 for another user's drawing", async () => {
    mocks.findFirst.mockResolvedValue(null)
    const res = await call('someone-elses')
    expect(res.status).toBe(404)
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'someone-elses', ownerId: 'user-a' },
    }))
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('returns 500 with a clear error when the stored drawing cannot be parsed', async () => {
    mocks.findFirst.mockResolvedValue({ drawing: 'not a drawing' })
    const res = await call('d1')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Invalid drawing data' })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('creates a copy owned by the caller', async () => {
    const data = drawing()
    mocks.findFirst.mockResolvedValue({ drawing: serializeDrawing(data) })
    const created = { id: 'copy', createdAt: new Date(0), updatedAt: new Date(0) }
    mocks.create.mockResolvedValue(created)

    const res = await call('d1')
    expect(res.status).toBe(201)
    expect((await res.json()).drawing.id).toBe('copy')
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { ownerId: 'user-a', drawing: serializeDrawing(data) },
    }))
  })
})
