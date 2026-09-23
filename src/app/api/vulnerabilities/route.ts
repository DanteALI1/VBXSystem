import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  vulnerabilities,
  vulnerabilitySources,
  vulnerabilityTagLinks,
  vulnerabilityTags,
} from "@/db/schema";
import { parseAdvancedQuery } from "@/lib/search/advanced-query";
import { apiError } from "@/lib/search/api-error";
import {
  ADVANCED_SEARCH_MAX_FIELDS_DEFAULT,
  SORT_FIELDS,
  VULN_PAGE_SIZE_DEFAULT,
  VULN_PAGE_SIZE_MAX,
  type VulnSortField,
} from "@/lib/search/constants";
import {
  astToSql,
  combineFilters,
  facetsToSql,
  type FacetFilters,
} from "@/lib/search/sql-builder";

function parseListParam(v: string | null): string[] | undefined {
  if (!v?.trim()) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseBoolParam(v: string | null): boolean | undefined {
  if (v == null || v === "") return undefined;
  if (["true", "1", "yes"].includes(v.toLowerCase())) return true;
  if (["false", "0", "no"].includes(v.toLowerCase())) return false;
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  let pageSize = Number(url.searchParams.get("pageSize") ?? VULN_PAGE_SIZE_DEFAULT);
  if (Number.isNaN(pageSize) || pageSize < 1) pageSize = VULN_PAGE_SIZE_DEFAULT;
  pageSize = Math.min(pageSize, VULN_PAGE_SIZE_MAX);

  const sortParam = (url.searchParams.get("sort") ?? "updated") as VulnSortField;
  const sort: VulnSortField = SORT_FIELDS.includes(sortParam) ? sortParam : "updated";
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const parsed = parseAdvancedQuery(q, ADVANCED_SEARCH_MAX_FIELDS_DEFAULT);
  if (!parsed.ok) {
    const tooComplex = /Too many fields/i.test(parsed.error);
    return apiError(400, tooComplex ? "SEARCH_TOO_COMPLEX" : "SEARCH_INVALID", parsed.error);
  }

  const sources = parseListParam(url.searchParams.get("source"))?.filter(
    (s): s is "nvd" | "bdu" => s === "nvd" || s === "bdu",
  );

  const facets: FacetFilters = {
    keyword: url.searchParams.get("keyword") ?? undefined,
    severity: parseListParam(url.searchParams.get("severity")),
    source: sources,
    kev: parseBoolParam(url.searchParams.get("kev")),
    cvssMin: url.searchParams.get("cvssMin") ? Number(url.searchParams.get("cvssMin")) : undefined,
    cvssMax: url.searchParams.get("cvssMax") ? Number(url.searchParams.get("cvssMax")) : undefined,
    vendor: url.searchParams.get("vendor") ?? undefined,
    product: url.searchParams.get("product") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    updatedFrom: url.searchParams.get("updatedFrom") ?? undefined,
    updatedTo: url.searchParams.get("updatedTo") ?? undefined,
  };

  const where = combineFilters(astToSql(parsed.ast), facetsToSql(facets));

  const orderBy = (() => {
    const dir = order === "asc" ? asc : desc;
    switch (sort) {
      case "cvss": return dir(vulnerabilities.cvssScore);
      case "epss": return dir(vulnerabilities.epssScore);
      case "cveId": return dir(vulnerabilities.cveId);
      case "updated":
      default: return dir(vulnerabilities.localSyncedAt);
    }
  })();

  const [{ total }] = await db.select({ total: count() }).from(vulnerabilities).where(where);
  const rows = await db.select().from(vulnerabilities).where(where).orderBy(orderBy).limit(pageSize).offset((page - 1) * pageSize);

  const ids = rows.map((r) => r.id);
  const sourcesByVuln = new Map<string, ("nvd" | "bdu")[]>();
  const tagsByVuln = new Map<string, { id: string; name: string; color: string | null }[]>();

  if (ids.length > 0) {
    const srcRows = await db
      .select({ vulnerabilityId: vulnerabilitySources.vulnerabilityId, source: vulnerabilitySources.source })
      .from(vulnerabilitySources)
      .where(inArray(vulnerabilitySources.vulnerabilityId, ids));
    for (const s of srcRows) {
      const list = sourcesByVuln.get(s.vulnerabilityId) ?? [];
      list.push(s.source);
      sourcesByVuln.set(s.vulnerabilityId, list);
    }

    const tagRows = await db
      .select({
        vulnerabilityId: vulnerabilityTagLinks.vulnerabilityId,
        id: vulnerabilityTags.id,
        name: vulnerabilityTags.name,
        color: vulnerabilityTags.color,
      })
      .from(vulnerabilityTagLinks)
      .innerJoin(vulnerabilityTags, eq(vulnerabilityTags.id, vulnerabilityTagLinks.tagId))
      .where(inArray(vulnerabilityTagLinks.vulnerabilityId, ids));
    for (const t of tagRows) {
      const list = tagsByVuln.get(t.vulnerabilityId) ?? [];
      list.push({ id: t.id, name: t.name, color: t.color });
      tagsByVuln.set(t.vulnerabilityId, list);
    }
  }

  const items = rows.map((r) => ({
    id: r.id,
    cveId: r.cveId,
    bduId: r.bduId,
    title: r.title,
    description: r.description,
    descriptionSnippet: r.description.length > 160 ? `${r.description.slice(0, 157)}…` : r.description,
    severity: r.severity,
    cvssScore: r.cvssScore != null ? Number(r.cvssScore) : null,
    cvssVector: r.cvssVector,
    epssScore: r.epssScore != null ? Number(r.epssScore) : null,
    kev: r.kev,
    vendors: r.vendors ?? [],
    products: r.products ?? [],
    vendorCount: (r.vendors ?? []).length,
    productCount: (r.products ?? []).length,
    localSyncedAt: r.localSyncedAt,
    updatedAt: r.updatedAt,
    publishedAt: r.publishedAt,
    sources: sourcesByVuln.get(r.id) ?? [],
    tags: tagsByVuln.get(r.id) ?? [],
  }));

  return NextResponse.json({ items, page, pageSize, total: Number(total), sort, order, q });
}
