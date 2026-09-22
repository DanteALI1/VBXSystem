export type AllowlistListItem = {
  id: string;
  pattern: string;
  type: "cidr" | "url";
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListAllowlistParams = {
  page: number;
  pageSize: number;
};

export type AllowlistListResponse = {
  items: AllowlistListItem[];
  total: number;
  page: number;
  pageSize: number;
};
