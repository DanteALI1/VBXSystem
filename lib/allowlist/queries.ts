import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { allowlistTargets } from "@/db/schema";
import { serializeAllowlistTarget } from "./serialize";
import type {
  AllowlistListItem,
  AllowlistListResponse,
  ListAllowlistParams,
} from "./types";
import type { CreateAllowlistInput, UpdateAllowlistInput } from "./schemas";

export function parseAllowlistListParams(
  searchParams: URLSearchParams,
): ListAllowlistParams {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "50") || 50;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
  return { page, pageSize };
}

export async function listAllowlist(
  params: ListAllowlistParams,
): Promise<AllowlistListResponse> {
  const [totalRow] = await db.select({ value: count() }).from(allowlistTargets);

  const rows = await db
    .select()
    .from(allowlistTargets)
    .orderBy(desc(allowlistTargets.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return {
    items: rows.map(serializeAllowlistTarget),
    total: totalRow?.value ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getAllowlistById(
  id: string,
): Promise<AllowlistListItem | null> {
  const [row] = await db
    .select()
    .from(allowlistTargets)
    .where(eq(allowlistTargets.id, id))
    .limit(1);
  return row ? serializeAllowlistTarget(row) : null;
}

export async function createAllowlistTarget(
  input: CreateAllowlistInput,
): Promise<AllowlistListItem> {
  const [row] = await db
    .insert(allowlistTargets)
    .values({
      pattern: input.pattern,
      type: input.type,
      enabled: input.enabled ?? true,
      description: input.description ?? null,
    })
    .returning();
  return serializeAllowlistTarget(row);
}

export async function updateAllowlistTarget(
  id: string,
  input: UpdateAllowlistInput,
): Promise<AllowlistListItem | null> {
  const patch: Partial<{
    pattern: string;
    type: "cidr" | "url";
    enabled: boolean;
    description: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (input.pattern !== undefined) patch.pattern = input.pattern;
  if (input.type !== undefined) patch.type = input.type;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.description !== undefined) {
    patch.description =
      input.description === "" || input.description == null
        ? null
        : input.description;
  }

  const [row] = await db
    .update(allowlistTargets)
    .set(patch)
    .where(eq(allowlistTargets.id, id))
    .returning();

  return row ? serializeAllowlistTarget(row) : null;
}

export async function deleteAllowlistTarget(id: string): Promise<boolean> {
  const deleted = await db
    .delete(allowlistTargets)
    .where(eq(allowlistTargets.id, id))
    .returning({ id: allowlistTargets.id });
  return deleted.length > 0;
}

/** Load enabled rules for scan gate (domain AllowlistRule shape). */
export async function listEnabledAllowlistRules() {
  const rows = await db
    .select({
      pattern: allowlistTargets.pattern,
      type: allowlistTargets.type,
      enabled: allowlistTargets.enabled,
    })
    .from(allowlistTargets)
    .where(eq(allowlistTargets.enabled, true));
  return rows;
}
