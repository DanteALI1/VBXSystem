import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { resolveActorUserId } from "@/lib/search/actor";
import { apiError } from "@/lib/search/api-error";
import { decodeSavedViewQuery, encodeSavedViewPayload } from "@/lib/search/saved-view";

export async function GET(request: Request) {
  const actorId = await resolveActorUserId(request);
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "vulnerabilities";
  const rows = await db.select().from(savedViews).orderBy(desc(savedViews.updatedAt));
  const items = rows
    .map((r) => {
      const payload = decodeSavedViewQuery(r.query);
      return {
        id: r.id, name: r.name, isShared: r.isShared, ownerUserId: r.ownerUserId,
        createdAt: r.createdAt, updatedAt: r.updatedAt, ...payload,
        scope: payload.scope ?? "vulnerabilities",
      };
    })
    .filter((r) => {
      if ((r.scope ?? "vulnerabilities") !== scope) return false;
      if (r.isShared) return true;
      if (!actorId) return true;
      return r.ownerUserId === actorId;
    });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const actorId = await resolveActorUserId(request);
  if (!actorId) {
    return apiError(401, "UNAUTHENTICATED", "No user available to own saved view (bootstrap admin missing)");
  }
  let body: { name?: string; q?: string; filters?: Record<string, unknown>; sort?: string; order?: string; columns?: string[]; isShared?: boolean; scope?: string };
  try { body = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON body"); }
  const name = body.name?.trim();
  if (!name) return apiError(400, "BAD_REQUEST", "name is required");

  const existing = await db.select().from(savedViews).where(eq(savedViews.ownerUserId, actorId));
  if (existing.some((e) => {
    const p = decodeSavedViewQuery(e.query);
    return e.name === name && (p.scope ?? "vulnerabilities") === (body.scope ?? "vulnerabilities");
  })) {
    return apiError(409, "CONFLICT", "Saved view name already exists");
  }

  const [created] = await db.insert(savedViews).values({
    name,
    ownerUserId: actorId,
    isShared: Boolean(body.isShared),
    query: encodeSavedViewPayload({
      q: body.q ?? "",
      filters: body.filters ?? {},
      sort: body.sort,
      order: body.order,
      columns: body.columns,
      scope: body.scope ?? "vulnerabilities",
    }),
  }).returning();

  const payload = decodeSavedViewQuery(created.query);
  return NextResponse.json({
    id: created.id, name: created.name, isShared: created.isShared, ownerUserId: created.ownerUserId,
    createdAt: created.createdAt, updatedAt: created.updatedAt, ...payload,
  }, { status: 201 });
}
