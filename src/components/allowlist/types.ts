export type AllowlistItem = {
  id: string;
  pattern: string;
  patternType: "cidr" | "url";
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AllowlistFormValues = {
  pattern: string;
  patternType: "cidr" | "url";
  enabled: boolean;
  description: string;
};

export const EMPTY_ALLOWLIST_FORM: AllowlistFormValues = {
  pattern: "",
  patternType: "cidr",
  enabled: true,
  description: "",
};
