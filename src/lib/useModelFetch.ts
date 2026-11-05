import { t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { FetchedModel } from "../types";

function showFetchModelsError(error: unknown) {
  const message = String(error);
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
    toast.error(t("ui.96e17498e735"));
  } else if (
    message.includes("All candidates failed") ||
    message.includes("HTTP 404") ||
    message.includes("HTTP 405")
  ) {
    toast.error(t("ui.56b7eb3743c2"));
  } else if (message.includes("timeout") || message.includes("timed out")) {
    toast.error(t("ui.0bbe0ca16290"));
  } else if (message.includes("Failed to parse")) {
    toast.error(t("ui.4d1f0f743b44"));
  } else {
    toast.error(t("ui.ec8760e5ee7d"));
  }
}

export function useModelFetch(
  url: string,
  apiKey: string,
  fetchModels: (url: string, apiKey: string) => Promise<FetchedModel[]>,
) {
  const [models, setModels] = useState<FetchedModel[]>([]);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const requestSequence = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    setModels([]);
    setRefreshingModels(false);
    pending.current = false;
    return () => {
      // Ignore results from a previous endpoint, credential, or unmounted panel.
      requestSequence.current += 1;
    };
  }, [url, apiKey]);

  const refreshModels = async () => {
    const baseUrl = url.trim();
    const key = apiKey.trim();
    if (!baseUrl || !key) {
      toast.error(
        !baseUrl && !key
          ? t("ui.131d43662db5")
          : !key
            ? t("ui.4e05b066d017")
            : t("ui.958bf63a8015"),
      );
      return;
    }
    if (pending.current) return;
    pending.current = true;
    const sequence = ++requestSequence.current;
    setRefreshingModels(true);
    try {
      const fetched = await fetchModels(baseUrl, key);
      if (sequence !== requestSequence.current) return;
      setModels(fetched);
      if (fetched.length === 0) {
        toast.info(t("ui.e26057a9b09c"));
      } else {
        toast.success(t("ui.a932bbe1e25c", { v0: fetched.length }));
      }
    } catch (error) {
      if (sequence === requestSequence.current) showFetchModelsError(error);
    } finally {
      if (sequence === requestSequence.current) {
        pending.current = false;
        setRefreshingModels(false);
      }
    }
  };

  return { models, refreshingModels, refreshModels };
}
