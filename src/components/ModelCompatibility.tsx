import { useEffect, useState } from "react";
import { getPricingCatalog } from "../lib/api";
import { t, useLocale } from "../lib/i18n";
import type { PricingCatalog } from "../lib/account-data";
import type { Agent } from "../lib/desktop-tools";

let cached: PricingCatalog | null = null;
let pending: Promise<PricingCatalog> | null = null;
let cachedAt = 0;
export function useModelCatalog() {
  const [catalog, setCatalog] = useState(cached);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!pending && (!cached || Date.now() - cachedAt > 60000)) {
      pending = getPricingCatalog()
        .then((value) => {
          cached = value;
          cachedAt = Date.now();
          return value;
        })
        .finally(() => {
          pending = null;
        });
    }
    void (pending ?? Promise.resolve(cached))
      .then((value) => {
        if (active) setCatalog(value);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return { catalog, error };
}

export default function ModelCompatibility({
  model,
  agent,
  protocol,
}: {
  model: string;
  agent?: Agent;
  protocol?: string;
}) {
  useLocale();
  const { catalog, error } = useModelCatalog();
  if (!model.trim()) return null;
  const item = catalog?.data.find((m) => m.model_name === model);
  const endpoints = item?.supported_endpoint_types ?? [];
  const expected =
    protocol ??
    (agent === "codex"
      ? "responses"
      : agent === "claude"
        ? "anthropic"
        : "openai");
  const supported = endpoints.some((type) =>
    expected === "responses"
      ? /responses?/i.test(type)
      : expected === "anthropic"
        ? /anthropic|claude|messages/i.test(type)
        : type.toLowerCase() === "openai" || /chat.?completions/i.test(type),
  );
  const known = !!endpoints.length;
  return (
    <div
      className="space-y-1 rounded-md border border-slate-200 px-3 py-2 text-xs leading-5 dark:border-white/10"
      role="status"
    >
      <p
        className={
          known
            ? supported
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
            : "text-slate-500"
        }
      >
        {t(
          known
            ? supported
              ? "feature.compatible"
              : "feature.incompatible"
            : "feature.compatibilityUnknown",
          {
            protocol:
              expected === "responses"
                ? "Responses API"
                : expected === "anthropic"
                  ? "Anthropic Messages"
                  : "Chat Completions",
          },
        )}
      </p>
      {known && (
        <p className="break-words text-slate-500">
          {t("feature.declaredProtocols")}: {endpoints.join(", ")}
        </p>
      )}
      <p className="text-slate-500">{t("feature.capabilitiesUnknown")}</p>
      {error && (
        <p className="text-amber-600">{t("feature.catalogUnavailable")}</p>
      )}
    </div>
  );
}
