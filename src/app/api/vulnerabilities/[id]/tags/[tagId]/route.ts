import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { vulnerabilityTagLinks } from "@/db/schema";
import { apiError } from "@/lib/search/api-error";

type Params = { params: Promise<{ id: string; tagId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id, tagId } = await params;
  const deleted = await db.delete(vulnerabilityTagLinks).where(and(
    eq(vulnerabilityTagLinks.vulnerabilityId, id),
    eq(vulnerabilityTagLinks.tagId, tagId),
  )).returning();
  if (deleted.length === 0) return apiError(404, "NOT_FOUND", "Tag link not found");
  return NextResponse.json({ ok: true });
}
