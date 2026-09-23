import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { allowlistTargets } from "@/db/schema";
import {
  AuthError,
  authErrorResponse,
  requireRole,
} from "@/lib/auth/rbac";
import { apiError } from "@/lib/search/api-error";
import {
  allowlistPatchSchema,
  emptyToNull,
  validatePatternPair,
} from "../validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireRole("admin");
    const { id } = await params;
    const [existing] = await db
      .select()
      .from(allowlistTargets)
      .where(eq(allowlistTargets.id, id))
      .limit(1);
    if (!existing) {
      return apiError(404, "NOT_FOUND", "Allowlist entry not found");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = allowlistPatchSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation failed";
      return apiError(400, "BAD_REQUEST", msg, parsed.error.flatten());
    }

    const data = parsed.data;
    const nextPattern = data.pattern ?? existing.pattern;
    const nextType = data.patternType ?? existing.patternType;
    const patternError = validatePatternPair(nextPattern, nextType);
    if (patternError) {
      return apiError(400, "BAD_REQUEST", patternError);
    }

    if (data.pattern !== undefined || data.patternType !== undefined) {
      const [dup] = await db
        .select({ id: allowlistTargets.id })
        .from(allowlistTargets)
        .where(
          and(
            eq(allowlistTargets.pattern, nextPattern),
            eq(allowlistTargets.patternType, nextType),
            ne(allowlistTargets.id, id),
          ),
        )
        .limit(1);
      if (dup) {
        return apiError(409, "CONFLICT", "Allowlist pattern already exists");
      }
    }

    const [updated] = await db
      .update(allowlistTargets)
      .set({
        ...(data.pattern !== undefined ? { pattern: data.pattern } : {}),
        ...(data.patternType !== undefined
          ? { patternType: data.patternType }
          : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.description !== undefined
          ? { description: emptyToNull(data.description) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(allowlistTargets.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("PATCH /api/allowlist/[id]", err);
    return apiError(500, "INTERNAL", "Failed to update allowlist entry");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireRole("admin");
    const { id } = await params;
    const [existing] = await db
      .select({ id: allowlistTargets.id })
      .from(allowlistTargets)
      .where(eq(allowlistTargets.id, id))
      .limit(1);
    if (!existing) {
      return apiError(404, "NOT_FOUND", "Allowlist entry not found");
    }
    await db.delete(allowlistTargets).where(eq(allowlistTargets.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("DELETE /api/allowlist/[id]", err);
    return apiError(500, "INTERNAL", "Failed to delete allowlist entry");
  }
}
