import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { allowlistTargets } from "@/db/schema";
import {
  AuthError,
  authErrorResponse,
  requireRole,
  requireSession,
} from "@/lib/auth/rbac";
import { targetsAllowed } from "@/lib/allowlist/matcher";
import { apiError } from "@/lib/search/api-error";
import { allowlistCreateSchema, emptyToNull } from "./validation";

export async function GET(request: Request) {
  try {
    await requireSession();
    const url = new URL(request.url);
    const enabledParam = url.searchParams.get("enabled");
    const previewTarget = url.searchParams.get("preview");

    let query = db
      .select()
      .from(allowlistTargets)
      .orderBy(asc(allowlistTargets.pattern))
      .$dynamic();

    if (enabledParam === "true") {
      query = query.where(eq(allowlistTargets.enabled, true));
    } else if (enabledParam === "false") {
      query = query.where(eq(allowlistTargets.enabled, false));
    }

    const items = await query;

    const response: {
      items: typeof items;
      preview?: { ok: true } | { ok: false; rejected: string[] };
    } = { items };

    if (previewTarget) {
      response.preview = targetsAllowed(
        [previewTarget],
        items.map((i) => ({
          pattern: i.pattern,
          patternType: i.patternType,
          enabled: i.enabled,
        })),
      );
    }

    return NextResponse.json(response);
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/allowlist", err);
    return apiError(500, "INTERNAL", "Failed to list allowlist");
  }
}

export async function POST(request: Request) {
  try {
    await requireRole("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = allowlistCreateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation failed";
      return apiError(400, "BAD_REQUEST", msg, parsed.error.flatten());
    }

    const data = parsed.data;
    const [dup] = await db
      .select({ id: allowlistTargets.id })
      .from(allowlistTargets)
      .where(
        and(
          eq(allowlistTargets.pattern, data.pattern),
          eq(allowlistTargets.patternType, data.patternType),
        ),
      )
      .limit(1);
    if (dup) {
      return apiError(409, "CONFLICT", "Allowlist pattern already exists");
    }

    const [created] = await db
      .insert(allowlistTargets)
      .values({
        pattern: data.pattern,
        patternType: data.patternType,
        enabled: data.enabled ?? true,
        description: emptyToNull(data.description ?? null),
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("POST /api/allowlist", err);
    return apiError(500, "INTERNAL", "Failed to create allowlist entry");
  }
}
