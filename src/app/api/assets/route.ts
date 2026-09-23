import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
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
import { assetCreateSchema, emptyToNull } from "./validation";

export async function GET(request: Request) {
  try {
    await requireSession();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const environment = (url.searchParams.get("environment") ?? "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    let pageSize = Number(url.searchParams.get("pageSize") ?? 50);
    if (Number.isNaN(pageSize) || pageSize < 1) pageSize = 50;
    pageSize = Math.min(pageSize, 200);
    const offset = (page - 1) * pageSize;

    const filters: SQL[] = [];
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(assets.name, like),
          ilike(assets.hostname, like),
          ilike(assets.ip, like),
        )!,
      );
    }
    if (environment) {
      filters.push(eq(assets.environment, environment));
    }
    const where = filters.length ? and(...filters) : undefined;

    const serviceCountSq = db
      .select({
        assetId: services.assetId,
        serviceCount: count(services.id).as("service_count"),
      })
      .from(services)
      .groupBy(services.assetId)
      .as("service_counts");

    const baseQuery = db
      .select({
        id: assets.id,
        name: assets.name,
        hostname: assets.hostname,
        ip: assets.ip,
        environment: assets.environment,
        criticality: assets.criticality,
        notes: assets.notes,
        createdById: assets.createdById,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        serviceCount: sql<number>`coalesce(${serviceCountSq.serviceCount}, 0)`.mapWith(
          Number,
        ),
      })
      .from(assets)
      .leftJoin(serviceCountSq, eq(assets.id, serviceCountSq.assetId));

    const items = await (where ? baseQuery.where(where) : baseQuery)
      .orderBy(desc(assets.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = where
      ? await db.select({ total: count() }).from(assets).where(where)
      : await db.select({ total: count() }).from(assets);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
    });
  } catch (err) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/assets", err);
    return apiError(500, "INTERNAL", "Failed to list assets");
  }
}

export async function POST(request: Request) {
  try {
    const { session } = await requireRole("analyst", "admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const parsed = assetCreateSchema.safeParse(body);
    if (!parsed.success) {
      const msg =
        parsed.error.issues[0]?.message ?? "Validation failed";
      return apiError(400, "BAD_REQUEST", msg, parsed.error.flatten());
    }

    const data = parsed.data;
    const [created] = await db
      .insert(assets)
      .values({
        name: data.name,
        hostname: emptyToNull(data.hostname ?? null),
        ip: emptyToNull(data.ip ?? null),
        environment: emptyToNull(data.environment ?? null),
        criticality: data.criticality ?? 3,
        notes: emptyToNull(data.notes ?? null),
        createdById: session.user.id,
      })
      .returning();

    return NextResponse.json({ ...created, serviceCount: 0 }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return authErrorResponse(err)!;
    }
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("POST /api/assets", err);
    return apiError(500, "INTERNAL", "Failed to create asset");
  }
}
