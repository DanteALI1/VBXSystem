import type { Asset, Service } from "@/db/schema";
import type { AssetDetail, AssetListItem, AssetServiceDto } from "./types";

export function serializeAsset(row: Asset): AssetListItem {
  return {
    id: row.id,
    hostname: row.hostname,
    ip: row.ip,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeService(row: Service): AssetServiceDto {
  return {
    id: row.id,
    port: row.port,
    protocol: row.protocol,
    name: row.name,
    product: row.product,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeAssetDetail(
  row: Asset,
  services: Service[],
): AssetDetail {
  return {
    ...serializeAsset(row),
    services: services.map(serializeService),
  };
}
