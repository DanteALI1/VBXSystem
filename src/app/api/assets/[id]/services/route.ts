import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { assets, services } from "@/db/schema";
import {
  AuthError,
  authErrorResponse,
  requireRole,
  requireSession,
} from "@/lib/auth/rbac";
import { apiError } from "@/lib/search/api-error";
import { emptyToNull, serviceCreateSchema } from "../../validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);
    if (!asset) return apiError(404, "NOT_FOUND", "Asset not found");

    const items = await db
      .select()
      .from(services)
      .where(eq(services.assetId, id))
      .orderBy(asc(services.port));

    return NextResponse.json({ items });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/assets/[id]/services", err);
    return apiError(500, "INTERNAL", "Failed to list services");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    await requireRole("analyst", "admin");
    const { id } = await params;
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);
    if (!asset) return apiError(404, "NOT_FOUND", "Asset not found");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = serviceCreateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation failed";
      return apiError(400, "BAD_REQUEST", msg, parsed.error.flatten());
    }

    const data = parsed.data;
    const [dup] = await db
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.assetId, id),
          eq(services.port, data.port),
          eq(services.protocol, data.protocol),
        ),
      )
      .limit(1);

    if (dup) {
      // Upsert semantics: update metadata / lastSeenAt on duplicate
      const now = new Date();
      const patch: Record<string, unknown> = {
        lastSeenAt: now,
        updatedAt: now,
      };
      if (data.name !== undefined) patch.name = emptyToNull(data.name);
      if (data.product !== undefined) patch.product = emptyToNull(data.product);
      if (data.version !== undefined) patch.version = emptyToNull(data.version);
      if (data.banner !== undefined) patch.banner = emptyToNull(data.banner);
      const [updated] = await db
        .update(services)
        .set(patch)
        .where(eq(services.id, dup.id))
        .returning();
      return NextResponse.json(updated, { status: 200 });
    }

    const now = new Date();
    const [created] = await db
      .insert(services)
      .values({
        assetId: id,
        port: data.port,
        protocol: data.protocol,
        name: emptyToNull(data.name ?? null),
        product: emptyToNull(data.product ?? null),
        version: emptyToNull(data.version ?? null),
        banner: emptyToNull(data.banner ?? null),
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning();

    await db
      .update(assets)
      .set({ updatedAt: now })
      .where(eq(assets.id, id));

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("POST /api/assets/[id]/services", err);
    return apiError(500, "INTERNAL", "Failed to create service");
  }
}
