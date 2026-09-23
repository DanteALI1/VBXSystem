import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { resolveActorUserId } from "@/lib/search/actor";
import { apiError } from "@/lib/search/api-error";
import { decodeSavedViewQuery } from "@/lib/search/saved-view";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const actorId = await resolveActorUserId(request);
  const [row] = await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1);
  if (!row) return apiError(404, "NOT_FOUND", "Saved view not found");
  if (actorId && row.ownerUserId !== actorId) {
    return apiError(403, "FORBIDDEN", "Only the owner can delete this view");
  }
  await db.delete(savedViews).where(eq(savedViews.id, id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const actorId = await resolveActorUserId(request);
  const [row] = await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1);
  if (!row) return apiError(404, "NOT_FOUND", "Saved view not found");
  if (actorId && row.ownerUserId !== actorId) {
    return apiError(403, "FORBIDDEN", "Only the owner can update this view");
  }
  let body: { name?: string; q?: string; filters?: Record<string, unknown>; sort?: string; order?: string; columns?: string[]; isShared?: boolean };
  try { body = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON body"); }

  const current = decodeSavedViewQuery(row.query);
  const nextQuery = JSON.stringify({
    ...current,
    ...(body.q !== undefined ? { q: body.q } : {}),
    ...(body.filters !== undefined ? { filters: body.filters } : {}),
    ...(body.sort !== undefined ? { sort: body.sort } : {}),
    ...(body.order !== undefined ? { order: body.order } : {}),
    ...(body.columns !== undefined ? { columns: body.columns } : {}),
  });

  const [updated] = await db.update(savedViews).set({
    ...(body.name?.trim() ? { name: body.name.trim() } : {}),
    ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
    query: nextQuery,
    updatedAt: new Date(),
  }).where(and(eq(savedViews.id, id))).returning();

  const payload = decodeSavedViewQuery(updated.query);
  return NextResponse.json({
    id: updated.id, name: updated.name, isShared: updated.isShared, ownerUserId: updated.ownerUserId,
    createdAt: updated.createdAt, updatedAt: updated.updatedAt, ...payload,
  });
}
