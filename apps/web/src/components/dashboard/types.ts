export type DashHit = {
  id: string;
  title: string;
  summary?: string;
  severity: string;
  cvss_score?: number | null;
  published_at?: string | null;
  is_cisa_kev: boolean;
  reason?: string;
  vendor?: string;
  product?: string;
  kev_date_added?: string | null;
  epss_score?: number | null;
  href: string;
};

export type EpssHit = {
  cve_id: string;
  score: number;
  percentile?: number;
  title?: string;
  severity?: string;
  is_cisa_kev?: boolean;
  href: string;
  previous_score?: number | null;
  delta?: number | null;
};

export type DashboardData = {
  kpis: {
    cves_today: number;
    cves_today_delta_pct?: number | null;
    cves_week: number;
    cves_week_delta_pct?: number | null;
    kev_week: number;
    kev_total: number;
    kev_catalog: number;
  };
  catalog_stats?: {
    cve_total: number;
    bdu_total: number;
    local_total: number;
    kev_catalog: number;
    epss_scored: number;
  };
  chart_range: string;
  activity: { date: string; count: number }[];
  attention_feed?: DashHit[];
  attention_window_days?: number;
  attention_epss_min?: number;
  recent_critical: DashHit[];
  recent_kev: DashHit[];
  epss_top?: EpssHit[];
  epss_deltas?: EpssHit[];
  sync_health: Record<
    string,
    { source: string; status: string; finished_at?: string | null; error?: string } | null
  >;
};

export type WidgetType =
  | "kpi_cve"
  | "kpi_cve_week"
  | "kpi_kev"
  | "kpi_kev_catalog"
  | "kpi_strip"
  | "catalog_stats"
  | "sync_health"
  | "sync_nvd"
  | "sync_bdu"
  | "activity_chart"
  | "attention_feed"
  | "attention_compact"
  | "list_recent_critical"
  | "list_recent_kev"
  | "list_epss_top"
  | "list_epss_deltas"
  | "quick_links"
  | "watchlist_cta";

export type WidgetCategory = "kpi" | "feeds" | "charts" | "sync" | "nav";

export type LayoutWidget = {
  i: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type LayoutBody = {
  version: number;
  cols: number;
  widgets: LayoutWidget[];
};

export type DashboardLayoutMeta = {
  id: number;
  slug: string;
  name: string;
  is_system: boolean;
  user_id?: number | null;
  layout: LayoutBody;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WidgetCatalogItem = {
  type: WidgetType;
  label: string;
  description: string;
  category: WidgetCategory;
  w: number;
  h: number;
};

export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  {
    type: "kpi_cve",
    label: "CVE сегодня",
    description: "Число CVE за сегодня и динамика за неделю",
    category: "kpi",
    w: 4,
    h: 2,
  },
  {
    type: "kpi_cve_week",
    label: "CVE за 7 дней",
    description: "Недельный KPI с процентом изменения",
    category: "kpi",
    w: 4,
    h: 2,
  },
  {
    type: "kpi_kev",
    label: "CISA KEV",
    description: "Флаги KEV за период и всего в каталоге",
    category: "kpi",
    w: 4,
    h: 2,
  },
  {
    type: "kpi_kev_catalog",
    label: "Каталог KEV",
    description: "Размер каталога CISA KEV",
    category: "kpi",
    w: 3,
    h: 2,
  },
  {
    type: "kpi_strip",
    label: "Полоса KPI",
    description: "CVE сегодня / неделя / KEV в одном блоке",
    category: "kpi",
    w: 12,
    h: 2,
  },
  {
    type: "catalog_stats",
    label: "Объём каталога",
    description: "Всего CVE, БДУ, Local, EPSS scored",
    category: "kpi",
    w: 6,
    h: 2,
  },
  {
    type: "attention_feed",
    label: "Требует внимания",
    description: "Смешанная лента: watchlist, KEV 7д, EPSS, Critical",
    category: "feeds",
    w: 12,
    h: 6,
  },
  {
    type: "attention_compact",
    label: "Внимание (компакт)",
    description: "Та же лента, укороченный список",
    category: "feeds",
    w: 8,
    h: 5,
  },
  {
    type: "list_recent_critical",
    label: "Critical ≥ 9.0",
    description: "Список критичных из attention feed",
    category: "feeds",
    w: 6,
    h: 4,
  },
  {
    type: "list_recent_kev",
    label: "Список KEV",
    description: "KEV из текущей ленты внимания",
    category: "feeds",
    w: 6,
    h: 4,
  },
  {
    type: "list_epss_top",
    label: "EPSS Top",
    description: "CVE с наибольшим EPSS score",
    category: "feeds",
    w: 4,
    h: 4,
  },
  {
    type: "list_epss_deltas",
    label: "EPSS Δ",
    description: "Наибольшие изменения EPSS",
    category: "feeds",
    w: 6,
    h: 4,
  },
  {
    type: "activity_chart",
    label: "Активность CVE",
    description: "Столбчатый график публикаций (1M / 6M / 1Y)",
    category: "charts",
    w: 12,
    h: 3,
  },
  {
    type: "sync_health",
    label: "Синхронизация",
    description: "Статус NVD / BDU / KEV / EPSS",
    category: "sync",
    w: 4,
    h: 3,
  },
  {
    type: "sync_nvd",
    label: "NVD sync",
    description: "Только здоровье источника NVD",
    category: "sync",
    w: 3,
    h: 2,
  },
  {
    type: "sync_bdu",
    label: "BDU sync",
    description: "Только здоровье источника БДУ",
    category: "sync",
    w: 3,
    h: 2,
  },
  {
    type: "quick_links",
    label: "Быстрые ссылки",
    description: "Search, CVEQL, EPSS, Tickets, Watchlist",
    category: "nav",
    w: 12,
    h: 2,
  },
  {
    type: "watchlist_cta",
    label: "Watchlist",
    description: "Призыв настроить org watchlist",
    category: "nav",
    w: 4,
    h: 2,
  },
];

export const CATEGORY_LABEL: Record<WidgetCategory, string> = {
  kpi: "KPI",
  feeds: "Ленты",
  charts: "Графики",
  sync: "Синхронизация",
  nav: "Навигация",
};
