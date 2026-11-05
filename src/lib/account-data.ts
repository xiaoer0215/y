import { t } from "./i18n";
import { readPricingTiers } from "./dynamic-pricing";

export interface PricingModel {
  icon?: string;
  model_name: string;
  description?: string;
  vendor_id?: number;
  quota_type: number;
  model_ratio?: number;
  completion_ratio?: number;
  model_price?: number;
  cache_ratio?: number | null;
  create_cache_ratio?: number | null;
  enable_groups?: string[];
  supported_endpoint_types?: string[];
  available?: boolean;
  tags?: string;
  billing_mode?: string;
  billing_expr?: string;
  billing_plugin_variants?: unknown[];
  billing_usage_schema?: unknown;
  context_length?: number;
  max_output_tokens?: number;
}

export interface PricingCatalog {
  data: PricingModel[];
  vendors?: { id: number; name: string; icon?: string }[];
  group_ratio?: Record<string, number>;
  usable_group?: Record<string, string | import("./site-content").GroupInfo>;
  user_group_display_names_localized?: Record<
    string,
    import("./site-content").GroupDisplayName
  >;
  supported_endpoint?: Record<string, unknown>;
}

export interface UsageLog {
  id: number;
  created_at: number;
  type: number;
  content?: string;
  token_name?: string;
  model_name?: string;
  quota?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  use_time?: number;
  is_stream?: boolean;
  group?: string;
  request_id?: string;
  upstream_request_id?: string;
  other?: string;
}

export interface UsageQuery {
  p: number;
  page_size: number;
  type: number;
  start_timestamp?: number;
  end_timestamp?: number;
  model_name?: string;
  token_name?: string;
  group?: string;
  request_id?: string;
}

export interface WalletBillQuery {
  p: number;
  page_size: number;
  keyword?: string;
}

export interface WalletBill {
  id: number;
  amount?: number;
  money?: number;
  trade_no?: string;
  payment_order_no?: string;
  payment_method?: string;
  payment_provider?: string;
  gift_amount?: number;
  credit_amount?: number;
  create_time?: number;
  complete_time?: number;
  status?: string;
}

export interface WalletBillPage {
  items: WalletBill[] | null;
  total: number;
  page: number;
  page_size: number;
}

export interface SupportTicket {
  id: number;
  ticket_no?: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  user_unread?: boolean;
  last_reply_at?: number;
  created_at: number;
  updated_at?: number;
}

export interface SupportTicketMessage {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  content: string;
  images?: string;
  created_at: number;
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
}

export interface SupportTicketPage {
  items: SupportTicket[] | null;
  total: number;
  page: number;
  page_size: number;
}

export interface UsagePage {
  items: UsageLog[] | null;
  total: number;
  page: number;
  page_size: number;
}

export interface UsageSummary {
  calls: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  averageDuration: number;
}

export function summarizeUsageLogs(
  rows: UsageLog[],
  quotaPerUnit: number,
): UsageSummary {
  const unit =
    Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000;
  const summary: UsageSummary = {
    calls: 0,
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    averageDuration: 0,
  };
  let durationTotal = 0;

  for (const log of rows) {
    // Type 2 is the site's completed API-consumption record. Other types are
    // account events such as top-ups, refunds, and authentication entries.
    if (log.type !== 2) continue;
    const input =
      Number.isFinite(log.prompt_tokens) && (log.prompt_tokens ?? 0) > 0
        ? log.prompt_tokens!
        : 0;
    const output =
      Number.isFinite(log.completion_tokens) && (log.completion_tokens ?? 0) > 0
        ? log.completion_tokens!
        : 0;
    const duration =
      Number.isFinite(log.use_time) && (log.use_time ?? 0) >= 0
        ? log.use_time!
        : 0;
    const quota = Number.isFinite(log.quota) ? (log.quota ?? 0) : 0;

    summary.calls += 1;
    summary.cost += quota / unit;
    summary.inputTokens += input;
    summary.outputTokens += output;
    durationTotal += duration;
  }

  summary.totalTokens = summary.inputTokens + summary.outputTokens;
  summary.averageDuration =
    summary.calls > 0 ? durationTotal / summary.calls : 0;
  return summary;
}

export function usageMetadata(log: UsageLog) {
  let other: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(log.other ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value))
      other = value as Record<string, unknown>;
  } catch {
    // Older records may contain plain text instead of JSON.
  }
  const number = (key: string): number | undefined => {
    const value = other[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  };
  const count = (key: string) => {
    const value = number(key);
    return value !== undefined && Number.isSafeInteger(value)
      ? value
      : undefined;
  };
  const firstCount = (...keys: string[]) => {
    for (const key of keys) {
      const value = count(key);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const splitWrite =
    (count("cache_creation_tokens_5m") ?? 0) +
    (count("cache_creation_tokens_1h") ?? 0);
  const firstResponseMs = number("frt");
  return {
    // A per-user group ratio overrides the group ratio; -1 means unset.
    groupRatio: number("user_group_ratio") ?? number("group_ratio"),
    cacheReadTokens: firstCount(
      "cache_tokens",
      "cache_read_tokens",
      "cached_tokens",
    ),
    cacheWriteTokens:
      splitWrite > 0 && Number.isSafeInteger(splitWrite)
        ? splitWrite
        : firstCount("cache_write_tokens", "cache_creation_tokens"),
    firstResponseSeconds:
      log.is_stream && firstResponseMs && firstResponseMs > 0
        ? firstResponseMs / 1000
        : undefined,
    requestPath:
      typeof other.request_path === "string" &&
      other.request_path.startsWith("/")
        ? other.request_path
        : undefined,
    billingSource:
      other.billing_source === "wallet" ||
      other.billing_source === "subscription"
        ? other.billing_source
        : undefined,
  };
}

export const logTypes: Record<number, string> = {
  get 1() {
    return t("account.topup");
  },
  get 2() {
    return t("ui.71d6df4130ec");
  },
  get 3() {
    return t("ui.4989b5cf9483");
  },
  get 4() {
    return t("ui.1a1f6dff7826");
  },
  get 5() {
    return t("ui.b859c7be7501");
  },
  get 6() {
    return t("ui.b82ef83b7f00");
  },
  get 7() {
    return t("ui.21f1e88275aa");
  },
};

export function usd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function isDynamic(model: PricingModel): boolean {
  return Boolean(
    model.billing_expr ||
      Object.keys(model.billing_usage_schema ?? {}).length ||
      (model.billing_mode &&
        model.billing_mode !== "ratio" &&
        model.billing_mode !== "fixed") ||
      model.billing_plugin_variants?.length,
  );
}

export function groupRatio(
  catalog: PricingCatalog,
  model: PricingModel,
  group: string,
): number {
  const ratios = catalog.group_ratio ?? {};
  if (group) return ratios[group] ?? 1;
  const values = (model.enable_groups ?? [])
    .map((g) => ratios[g])
    .filter((v) => Number.isFinite(v));
  return values.length ? Math.min(...values) : 1;
}

export function modelPrices(model: PricingModel, ratio: number) {
  if (isDynamic(model)) {
    const tiers = readPricingTiers(model.billing_expr);
    const range = (key: string) => {
      if (!tiers.length || tiers.some((t) => t.fixed !== undefined))
        return t("ui.af9df0b600c3");
      if (key === "cr" && tiers.every((t) => t.prices.cr === undefined))
        return "—";
      const values = tiers.map((t) => (t.prices[key] ?? 0) * ratio);
      const min = Math.min(...values),
        max = Math.max(...values);
      return min === max ? usd(min) : `${usd(min)} – ${usd(max)}`;
    };
    return { input: range("p"), output: range("c"), cache: range("cr") };
  }
  if (model.quota_type === 1)
    return {
      input:
        usd(
          model.model_price === undefined
            ? undefined
            : model.model_price * ratio,
        ) + t("ui.7e4b4f47925b"),
      output: "—",
      cache: "—",
    };
  const base =
    model.model_ratio === undefined ? undefined : model.model_ratio * 2 * ratio;
  return {
    input: usd(base),
    output: usd(
      base === undefined || model.completion_ratio === undefined
        ? undefined
        : base * model.completion_ratio,
    ),
    cache: usd(
      base === undefined || model.cache_ratio == null
        ? undefined
        : base * model.cache_ratio,
    ),
  };
}
