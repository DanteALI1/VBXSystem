export type SavedViewPayload = {
  q?: string;
  filters?: Record<string, unknown>;
  sort?: string;
  order?: string;
  columns?: string[];
  scope?: string;
};

export function encodeSavedViewPayload(payload: SavedViewPayload): string {
  return JSON.stringify({
    scope: "vulnerabilities",
    ...payload,
  });
}

export function decodeSavedViewQuery(raw: string): SavedViewPayload {
  try {
    const parsed = JSON.parse(raw) as SavedViewPayload;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* plain query string fallback */
  }
  return { q: raw, scope: "vulnerabilities" };
}
