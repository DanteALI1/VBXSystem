import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, services } from "@/db/schema";
import {
  serializeAsset,
  serializeAssetDetail,
} from "./serialize";
import type {
  AssetDetail,
  AssetListItem,
  AssetListResponse,
  ListAssetsParams,
} from "./types";
import type { CreateAssetInput, UpdateAssetInput } from "./schemas";

export function parseAssetListParams(
  searchParams: URLSearchParams,
): ListAssetsParams {
  const q = searchParams.get("q")?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "25") || 25;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
  return { q, page, pageSize };
}

function buildSearchCondition(q: string | undefined): SQL | undefined {
  if (!q?.trim()) return undefined;
  const pattern = `%${q.trim()}%`;
  return or(
    ilike(assets.hostname, pattern),
    ilike(assets.ip, pattern),
    ilike(assets.description, pattern),
  );
}

export async function listAssets(
  params: ListAssetsParams,
): Promise<AssetListResponse> {
  const conditions: SQL[] = [];
  const search = buildSearchCondition(params.q);
  if (search) conditions.push(search);
  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(assets)
    .where(where);

  const rows = await db
    .select()
    .from(assets)
    .where(where)
    .orderBy(desc(assets.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return {
    items: rows.map(serializeAsset),
    total: totalRow?.value ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getAssetById(id: string): Promise<AssetDetail | null> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!row) return null;

  const serviceRows = await db
    .select()
    .from(services)
    .where(eq(services.assetId, id))
    .orderBy(services.port);

  return serializeAssetDetail(row, serviceRows);
}

export async function createAsset(
  input: CreateAssetInput,
): Promise<AssetListItem> {
  const [row] = await db
    .insert(assets)
    .values({
      hostname: input.hostname,
      ip: input.ip,
      description: input.description ?? null,
    })
    .returning();
  return serializeAsset(row);
}

export async function updateAsset(
  id: string,
  input: UpdateAssetInput,
): Promise<AssetListItem | null> {
  const patch: Partial<{
    hostname: string;
    ip: string;
    description: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (input.hostname !== undefined) patch.hostname = input.hostname;
  if (input.ip !== undefined) patch.ip = input.ip;
  if (input.description !== undefined) {
    patch.description =
      input.description === "" || input.description == null
        ? null
        : input.description;
  }

  const [row] = await db
    .update(assets)
    .set(patch)
    .where(eq(assets.id, id))
    .returning();

  return row ? serializeAsset(row) : null;
}

export async function deleteAsset(id: string): Promise<boolean> {
  const deleted = await db
    .delete(assets)
    .where(eq(assets.id, id))
    .returning({ id: assets.id });
  return deleted.length > 0;
}
