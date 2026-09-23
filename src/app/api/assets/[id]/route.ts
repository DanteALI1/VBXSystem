import { asc, eq } from "drizzle-orm";
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
import { assetPatchSchema, emptyToNull } from "../validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    const [asset] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);
    if (!asset) return apiError(404, "NOT_FOUND", "Asset not found");

    const serviceRows = await db
      .select()
      .from(services)
      .where(eq(services.assetId, id))
      .orderBy(asc(services.port));

    return NextResponse.json({
      ...asset,
      services: serviceRows,
      serviceCount: serviceRows.length,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/assets/[id]", err);
    return apiError(500, "INTERNAL", "Failed to load asset");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireRole("analyst", "admin");
    const { id } = await params;
    const [existing] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);
    if (!existing) return apiError(404, "NOT_FOUND", "Asset not found");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = assetPatchSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation failed";
      return apiError(400, "BAD_REQUEST", msg, parsed.error.flatten());
    }

    const data = parsed.data;
    const [updated] = await db
      .update(assets)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.hostname !== undefined
          ? { hostname: emptyToNull(data.hostname) }
          : {}),
        ...(data.ip !== undefined ? { ip: emptyToNull(data.ip) } : {}),
        ...(data.environment !== undefined
          ? { environment: emptyToNull(data.environment) }
          : {}),
        ...(data.criticality !== undefined
          ? { criticality: data.criticality }
          : {}),
        ...(data.notes !== undefined ? { notes: emptyToNull(data.notes) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("PATCH /api/assets/[id]", err);
    return apiError(500, "INTERNAL", "Failed to update asset");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireRole("admin");
    const { id } = await params;
    const [existing] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);
    if (!existing) return apiError(404, "NOT_FOUND", "Asset not found");

    await db.delete(assets).where(eq(assets.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)!;
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("DELETE /api/assets/[id]", err);
    return apiError(500, "INTERNAL", "Failed to delete asset");
  }
}
