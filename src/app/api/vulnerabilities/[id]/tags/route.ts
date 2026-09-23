import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { vulnerabilities, vulnerabilityTagLinks, vulnerabilityTags } from "@/db/schema";
import { resolveActorUserId } from "@/lib/search/actor";
import { apiError } from "@/lib/search/api-error";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const actorId = await resolveActorUserId(request);
  if (!actorId) {
    return apiError(401, "UNAUTHENTICATED", "No user available for tag assignment (bootstrap admin missing)");
  }

  const [vuln] = await db.select({ id: vulnerabilities.id }).from(vulnerabilities).where(eq(vulnerabilities.id, id)).limit(1);
  if (!vuln) return apiError(404, "NOT_FOUND", "Vulnerability not found");

  let body: { tagId?: string; name?: string; color?: string };
  try { body = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON body"); }

  let tagId = body.tagId;
  if (!tagId && body.name?.trim()) {
    const name = body.name.trim();
    const [existing] = await db.select().from(vulnerabilityTags).where(eq(vulnerabilityTags.name, name)).limit(1);
    if (existing) tagId = existing.id;
    else {
      const [created] = await db.insert(vulnerabilityTags).values({ name, color: body.color ?? null, ownerUserId: actorId }).returning();
      tagId = created.id;
    }
  }
  if (!tagId) return apiError(400, "BAD_REQUEST", "tagId or name required");

  const [tag] = await db.select().from(vulnerabilityTags).where(eq(vulnerabilityTags.id, tagId)).limit(1);
  if (!tag) return apiError(404, "NOT_FOUND", "Tag not found");

  const [existingLink] = await db.select().from(vulnerabilityTagLinks).where(and(
    eq(vulnerabilityTagLinks.vulnerabilityId, id),
    eq(vulnerabilityTagLinks.tagId, tagId),
  )).limit(1);

  if (!existingLink) {
    await db.insert(vulnerabilityTagLinks).values({ vulnerabilityId: id, tagId });
  }

  return NextResponse.json({ ok: true, tag: { id: tag.id, name: tag.name, color: tag.color } });
}
