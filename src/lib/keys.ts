import type { TokenItem } from "../types";
import type { GroupInfo, GroupDisplayName } from "./site-content";
export interface AccountKey extends TokenItem {
  used_quota: number;
  created_time: number;
  accessed_time: number;
  auto_groups: string[] | null;
  cross_group_retry: boolean | number;
  model_limits_enabled: boolean;
  model_limits: string | null;
  allow_ips: string | null;
}
export interface KeyForm {
  name: string;
  remain_quota: number;
  unlimited_quota: boolean;
  expired_time: number;
  group: string;
  auto_groups: string[];
  cross_group_retry: boolean;
  model_limits_enabled: boolean;
  model_limits: string;
  allow_ips: string;
}
export interface KeyPage {
  items: AccountKey[];
  total: number;
  page: number;
  page_size: number;
}
export interface KeyGroups {
  groups: Record<string, import("./site-content").GroupInfo>;
  auto: { groups: string[]; max_count: number };
}
export interface RawKeyGroups {
  groups: Record<
    string,
    Omit<GroupInfo, "ratio" | "display_name"> & {
      ratio?: number | string;
      display_name?: GroupDisplayName | string;
      display_name_localized?: GroupDisplayName;
    }
  >;
  auto: KeyGroups["auto"];
}

export function normalizeKeyGroups(result: RawKeyGroups): KeyGroups {
  return {
    ...result,
    groups: Object.fromEntries(
      Object.entries(result.groups).map(([id, info]) => [
        id,
        {
          ...info,
          ratio:
            typeof info.ratio === "number" &&
            Number.isFinite(info.ratio) &&
            info.ratio >= 0
              ? info.ratio
              : undefined,
          display_name:
            info.display_name_localized ||
            (typeof info.display_name === "string"
              ? { en: info.display_name }
              : info.display_name),
        },
      ]),
    ),
  };
}
