import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { vulnerabilityTags } from "@/db/schema";
import { resolveActorUserId } from "@/lib/search/actor";
import { apiError } from "@/lib/search/api-error";

export async function GET() {
  const items = await db.select().from(vulnerabilityTags).orderBy(asc(vulnerabilityTags.name));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const actorId = await resolveActorUserId(request);
  if (!actorId) {
    return apiError(401, "UNAUTHENTICATED", "No user available to create tag (bootstrap admin missing)");
  }
  let body: { name?: string; color?: string };
  try { body = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON body"); }
  const name = body.name?.trim();
  if (!name) return apiError(400, "BAD_REQUEST", "name is required");
  const [existing] = await db.select().from(vulnerabilityTags).where(eq(vulnerabilityTags.name, name)).limit(1);
  if (existing) return NextResponse.json(existing);
  const [created] = await db.insert(vulnerabilityTags).values({ name, color: body.color ?? null, ownerUserId: actorId }).returning();
  return NextResponse.json(created, { status: 201 });
}
