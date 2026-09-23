export type VulnListItem = {
  id: string;
  cveId: string | null;
  bduId: string | null;
  title: string;
  description: string;
  descriptionSnippet: string;
  severity: "none" | "low" | "medium" | "high" | "critical" | null;
  cvssScore: number | null;
  cvssVector: string | null;
  epssScore: number | null;
  kev: boolean;
  vendors: string[];
  products: string[];
  vendorCount: number;
  productCount: number;
  localSyncedAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  sources: ("nvd" | "bdu")[];
  tags: { id: string; name: string; color: string | null }[];
};

export type VulnListResponse = {
  items: VulnListItem[];
  page: number;
  pageSize: number;
  total: number;
  sort: string;
  order: string;
  q: string;
};

export type CatalogFilters = {
  severity: string[];
  source: string[];
  kev: "" | "true" | "false";
  cvssMin: string;
  cvssMax: string;
  vendor: string;
  product: string;
  tag: string;
  updatedFrom: string;
  updatedTo: string;
};

export const EMPTY_FILTERS: CatalogFilters = {
  severity: [],
  source: [],
  kev: "",
  cvssMin: "",
  cvssMax: "",
  vendor: "",
  product: "",
  tag: "",
  updatedFrom: "",
  updatedTo: "",
};
