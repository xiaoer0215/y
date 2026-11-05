import type { TopupInfo, TopupPaymentMethod } from "../types";

export const positiveAmount = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return list(value).filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
}

export function normalizeTopupInfo(data: TopupInfo): TopupInfo {
  const methods: TopupPaymentMethod[] = records(data.pay_methods)
    .filter(
      (item) =>
        typeof item.type === "string" &&
        !!item.type &&
        typeof item.name === "string" &&
        !!item.name &&
        item.type !== "waffo" &&
        item.type !== "creem",
    )
    .map((item) => ({
      ...item,
      type: String(item.type),
      name: String(item.name),
      id: String(item.type),
    }));
  if (data.enable_waffo_topup) {
    records(data.waffo_pay_methods).forEach((item, index) => {
      if (typeof item.name === "string" && item.name) {
        methods.push({
          name: item.name,
          icon: typeof item.icon === "string" ? item.icon : undefined,
          type: "waffo",
          id: `waffo-${index}`,
          waffo_index: index,
        });
      }
    });
  }
  if (data.enable_creem_topup) {
    records(data.creem_products).forEach((item) => {
      if (
        typeof item.name === "string" &&
        typeof item.productId === "string" &&
        item.productId &&
        positiveAmount(item.quota) &&
        positiveAmount(item.price)
      ) {
        methods.push({
          name: item.name,
          type: "creem",
          id: `creem-${item.productId}`,
          product_id: item.productId,
          fixed_amount: positiveAmount(item.quota),
          fixed_price: positiveAmount(item.price),
          currency: item.currency === "EUR" ? "EUR" : "USD",
        });
      }
    });
  }
  return {
    ...data,
    pay_methods: methods,
    amount_options: list(data.amount_options)
      .map(positiveAmount)
      .filter(Number.isSafeInteger)
      .filter((n) => n > 0),
  };
}

export function minimumTopup(
  info: TopupInfo | null,
  method?: TopupPaymentMethod,
): number {
  if (method?.type === "creem") return method.fixed_amount || 1;
  const globalMinimum = info?.enable_online_topup
    ? positiveAmount(info.min_topup)
    : info?.enable_stripe_topup
      ? positiveAmount(info.stripe_min_topup)
      : info?.enable_waffo_topup
        ? positiveAmount(info.waffo_min_topup)
        : info?.enable_waffo_pancake_topup
          ? positiveAmount(info.waffo_pancake_min_topup)
          : positiveAmount(info?.min_topup);
  const providerMinimum =
    method?.type === "stripe"
      ? positiveAmount(info?.stripe_min_topup)
      : method?.type === "waffo"
        ? positiveAmount(info?.waffo_min_topup)
        : method?.type === "waffo_pancake"
          ? positiveAmount(info?.waffo_pancake_min_topup)
          : 0;
  return Math.max(
    1,
    positiveAmount(method?.min_topup),
    providerMinimum,
    method?.type === "waffo" ? 0 : globalMinimum,
  );
}

export function processingFee(
  base: number,
  method: string,
  info: TopupInfo | null,
): number {
  const rawMethods = info?.processing_fee_methods;
  const methods =
    typeof rawMethods === "string" && !rawMethods.trim().startsWith("[")
      ? rawMethods.split(",")
      : list(rawMethods);
  if (
    !info ||
    base <= 0 ||
    base > positiveAmount(info.processing_fee_threshold) ||
    !methods.some(
      (value) => String(value).trim().toLowerCase() === method.toLowerCase(),
    )
  )
    return 0;
  const tiers = records(info.processing_fee_tiers)
    .map((tier) => ({
      start: positiveAmount(tier.start_amount ?? tier.min),
      end: positiveAmount(tier.end_amount ?? tier.max),
      fixed: positiveAmount(tier.fixed_fee ?? tier.amount),
      rate: positiveAmount(tier.rate),
    }))
    .filter(
      (tier) =>
        (tier.fixed > 0 || tier.rate > 0) &&
        (!tier.end || tier.end > tier.start),
    )
    .sort((a, b) => a.start - b.start)
    .slice(0, 5);
  const tier = tiers.find(
    (item) => base >= item.start && (!item.end || base <= item.end),
  );
  return tier
    ? tier.fixed + (base * tier.rate) / 100
    : positiveAmount(info.processing_fee_amount) +
        (base * positiveAmount(info.processing_fee_rate)) / 100;
}

export function feeFromTotal(
  total: number,
  method: string,
  info: TopupInfo | null,
): number {
  let base = total;
  for (let index = 0; index < 8; index++) {
    const next = Math.max(0, total - processingFee(base, method, info));
    if (Math.abs(next - base) < 0.000001)
      return Math.round((total - next) * 100) / 100;
    base = next;
  }
  return Math.round(processingFee(base, method, info) * 100) / 100;
}
