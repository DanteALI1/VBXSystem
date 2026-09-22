export type AssetListItem = {
  id: string;
  hostname: string;
  ip: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetServiceDto = {
  id: string;
  port: number;
  protocol: string;
  name: string | null;
  product: string | null;
  version: string | null;
  createdAt: string;
};

export type AssetDetail = AssetListItem & {
  services: AssetServiceDto[];
};

export type ListAssetsParams = {
  q?: string;
  page: number;
  pageSize: number;
};

export type AssetListResponse = {
  items: AssetListItem[];
  total: number;
  page: number;
  pageSize: number;
};
