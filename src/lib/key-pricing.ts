import type { PricingCatalog, PricingModel } from "./account-data";
import type { KeyGroups } from "./keys";

export function keyGroupRatio(
  group: string,
  groups: KeyGroups | null,
  catalog: PricingCatalog | null,
) {
  if (!group || group === "auto") return undefined;
  // Self/groups includes the account's effective discount and takes precedence.
  const value = groups?.groups[group]?.ratio ?? catalog?.group_ratio?.[group];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function keyGroupModels(
  catalog: PricingCatalog,
  groups: KeyGroups | null,
  group: string,
  limitsEnabled: boolean,
  limits: string,
): PricingModel[] {
  if (!group || group === "auto") return [];
  const allowed = groups?.groups[group]?.models;
  const limited = new Set(
    limits
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return catalog.data.filter((model) => {
    const enabled = allowed
      ? allowed.includes(model.model_name)
      : model.enable_groups?.some((g) => g === group || g === "all");
    return (
      model.available !== false &&
      enabled &&
      (!limitsEnabled || limited.has(model.model_name))
    );
  });
}

export function ratioText(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${value}×`
    : "—";
}
