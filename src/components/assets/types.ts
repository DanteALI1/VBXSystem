export type AssetListItem = {
  id: string;
  name: string;
  hostname: string | null;
  ip: string | null;
  environment: string | null;
  criticality: number;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  serviceCount: number;
};

export type ServiceItem = {
  id: string;
  assetId: string;
  port: number;
  protocol: string;
  name: string | null;
  product: string | null;
  version: string | null;
  banner: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetDetail = Omit<AssetListItem, "serviceCount"> & {
  services: ServiceItem[];
  serviceCount: number;
};

export type AssetFormValues = {
  name: string;
  hostname: string;
  ip: string;
  environment: string;
  criticality: number;
  notes: string;
};

export const EMPTY_ASSET_FORM: AssetFormValues = {
  name: "",
  hostname: "",
  ip: "",
  environment: "",
  criticality: 3,
  notes: "",
};
