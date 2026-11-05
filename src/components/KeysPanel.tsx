import { primaryApiEndpoint } from "../lib/site-content";
import { t, useLocale } from "../lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  KeyRound,
  Plus,
  Search,
  Play,
  Pencil,
  Trash2,
  Activity,
  Power,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  applyApiKeyToAgents,
  deleteAccountKey,
  fetchCodexModels,
  getAccountKey,
  getKeyGroups,
  getPricingCatalog,
  getTokenKey,
  listAccountKeys,
  saveAccountKey,
  setAccountKeyStatus,
  setSelectedToken,
} from "../lib/api";
import type { AccountKey, KeyForm, KeyGroups, KeyPage } from "../lib/keys";
import type { PricingCatalog } from "../lib/account-data";
import { keyGroupRatio } from "../lib/key-pricing";
import { ratioText } from "../lib/key-pricing";
import { useAuth } from "../lib/useAuth";
import { useGroupDisplayName } from "../lib/site-content";
import { workspaceCredentials, type Agent } from "../lib/desktop-tools";
import type { TokenItem } from "../types";
import { IconButton } from "./ui/IconButton";
import ActionMenu from "./ui/ActionMenu";
import {
  buttonClass,
  cardClass,
  DataHeader,
  DataState,
  DetailDialog,
  fieldClass,
  Pagination,
} from "./AccountDataUI";

const agents = [
  { id: "chatgpt", name: "Codex" },
  { id: "claude", name: "Claude Code" },
  { id: "workbuddy", name: "WorkBuddy" },
  { id: "acciowork", name: "AccioWork" },
];
const emptyForm: KeyForm = {
  name: "",
  remain_quota: 0,
  unlimited_quota: true,
  expired_time: -1,
  group: "",
  auto_groups: [],
  cross_group_retry: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
};
const statusNames: Record<number, string> = {
  get 1() {
    return t("ui.e91365cf9ed9");
  },
  get 2() {
    return t("ui.0fe5a98e9f8c");
  },
  get 3() {
    return t("ui.1354374f768e");
  },
  get 4() {
    return t("ui.1104c0677e9b");
  },
};
function usable(key: AccountKey) {
  return (
    key.status === 1 &&
    (key.expired_time === -1 || key.expired_time > Date.now() / 1000) &&
    (key.unlimited_quota || key.remain_quota > 0)
  );
}
function dateInput(timestamp: number) {
  if (timestamp < 0) return "";
  const d = new Date(timestamp * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function readBindings(): Record<number, string[]> {
  const result: Record<number, string[]> = {};
  for (const agent of agents) {
    try {
      const bound = JSON.parse(
        localStorage.getItem(`bound_token_${agent.id}`) ?? "null",
      );
      if (Number.isSafeInteger(bound?.id))
        (result[bound.id] ??= []).push(agent.name);
    } catch {
      /* Ignore malformed optional metadata. */
    }
  }
  return result;
}

export interface KeySelection {
  selectedTokenId?: number | null;
  onSelectKey: (key: string, token: TokenItem) => void | Promise<void>;
  onClose: () => void;
  toolName: string;
}

export default function KeysPanel({
  showLogs,
  selection,
}: {
  defaultTarget?: string;
  showLogs?: (name: string) => void;
  selection?: KeySelection;
}) {
  useLocale();
  const { refreshState } = useAuth();
  const [bindings, setBindings] = useState<Record<number, string[]>>({});
  const [selectedId, setSelectedId] = useState(selection?.selectedTokenId);
  const [details, setDetails] = useState<AccountKey | null>(null);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const update = async () => {
      const current = ++sequence;
      const candidates = readBindings();
      const keys = new Map<number, Promise<string>>();
      const verified: Record<number, string[]> = {};
      await Promise.allSettled(
        agents.map(async (agent) => {
          const id = Object.keys(candidates)
            .map(Number)
            .find((id) => candidates[id].includes(agent.name));
          if (id === undefined) return;
          if (!keys.has(id)) keys.set(id, getTokenKey(id));
          const [config, key] = await Promise.all([
            workspaceCredentials(
              (agent.id === "chatgpt" ? "codex" : agent.id) as Agent,
            ),
            keys.get(id)!,
          ]);
          if (key.trim() && key.trim() === config.key.trim())
            (verified[id] ??= []).push(agent.name);
        }),
      );
      if (active && current === sequence) setBindings(verified);
    };
    void update();
    for (const event of [
      "focus",
      "storage",
      "ai_helper_sync_all_tokens",
      "ai_helper_group_updated",
      "workspace-config-changed",
    ])
      window.addEventListener(event, update);
    return () => {
      active = false;
      for (const event of [
        "focus",
        "storage",
        "ai_helper_sync_all_tokens",
        "ai_helper_group_updated",
        "workspace-config-changed",
      ])
        window.removeEventListener(event, update);
    };
  }, []);
  const [data, setData] = useState<KeyPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [edit, setEdit] = useState<{ id: number | null; form: KeyForm } | null>(
    null,
  );
  const [groups, setGroups] = useState<KeyGroups | null>(null);
  const [groupError, setGroupError] = useState("");
  const [catalog, setCatalog] = useState<PricingCatalog | null>(null);
  const metadataRequest = useRef(0);
  const loadRates = useCallback(async () => {
    const seq = ++metadataRequest.current;
    const [groupResult, pricingResult] = await Promise.allSettled([
      getKeyGroups(),
      getPricingCatalog(),
    ]);
    if (seq !== metadataRequest.current) return;
    if (groupResult.status === "fulfilled") {
      setGroups(groupResult.value);
      setGroupError("");
    } else {
      setGroups(null);
      setGroupError(String(groupResult.reason));
    }
    if (pricingResult.status === "fulfilled") {
      setCatalog(pricingResult.value);
    } else {
      setCatalog(null);
    }
  }, []);
  useEffect(() => {
    void loadRates();
    return () => {
      metadataRequest.current++;
    };
  }, [loadRates]);
  const displayGroup = useGroupDisplayName();
  const groupName = (group: string) =>
    displayGroup(group, groups?.groups[group]);
  const groupRate = (group?: string | null) =>
    group === "auto"
      ? t("keys.autoRate")
      : ratioText(keyGroupRatio(group ?? "", groups, catalog));
  const [remove, setRemove] = useState<AccountKey | null>(null);
  const [apply, setApply] = useState<AccountKey | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, boolean> | null>(null);
  const load = useCallback(async () => {
    const seq = ++request.current;
    setLoading(true);
    setError("");
    try {
      const response = await listAccountKeys(page, keyword);
      if (request.current !== seq) return;
      if (!Array.isArray(response.items) || !Number.isFinite(response.total))
        throw Error(t("ui.6ca1cd923164"));
      if (page > 1 && !response.items.length) {
        setPage(page - 1);
        return;
      }
      setData(response);
    } catch (e) {
      if (request.current === seq) setError(String(e));
    } finally {
      if (request.current === seq) setLoading(false);
    }
  }, [page, keyword]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  const close = () => {
    if (busy) return;
    setEdit(null);
    setRemove(null);
    setApply(null);
    setDetails(null);
    setResults(null);
    setActionError("");
  };
  const openEditor = async (item?: AccountKey) => {
    setBusy(true);
    setActionError("");
    try {
      const full = item ? await getAccountKey(item.id) : null;
      setEdit({
        id: full?.id ?? null,
        form: full
          ? {
              name: full.name,
              remain_quota: full.remain_quota,
              unlimited_quota: full.unlimited_quota,
              expired_time: full.expired_time,
              group: full.group ?? "",
              auto_groups: full.auto_groups ?? [],
              cross_group_retry: !!full.cross_group_retry,
              model_limits_enabled: full.model_limits_enabled,
              model_limits: full.model_limits ?? "",
              allow_ips: full.allow_ips ?? "",
            }
          : { ...emptyForm, auto_groups: [] },
      });
      await loadRates();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  const setForm = (patch: Partial<KeyForm>) =>
    setEdit((old) => (old ? { ...old, form: { ...old.form, ...patch } } : old));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const form = edit.form;
      if (edit.id === null && !form.group.trim())
        throw Error(t("keys.chooseGroup"));
      if (!Number.isSafeInteger(form.remain_quota) || form.remain_quota < 0)
        throw Error(t("ui.88de08203a7d"));
      if (
        form.expired_time !== -1 &&
        (!Number.isFinite(form.expired_time) ||
          form.expired_time <= Date.now() / 1000)
      )
        throw Error(t("ui.a00de9dba12a"));
      if (
        form.group === "auto" &&
        groups &&
        form.auto_groups.length > groups.auto.max_count
      )
        throw Error(t("ui.c37240c8668e", { v0: groups.auto.max_count }));
      await saveAccountKey(edit.id, {
        ...form,
        name: form.name.trim(),
        auto_groups: form.group === "auto" ? form.auto_groups : [],
        cross_group_retry: form.group === "auto" && form.cross_group_retry,
      });
      setEdit(null);
      toast.success(edit.id ? t("ui.d5680cc4ee08") : t("ui.a50bc796e623"));
      await load();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = async (item: AccountKey) => {
    setBusy(true);
    try {
      await setAccountKeyStatus(item.id, item.status === 1 ? 2 : 1);
      await load();
      toast.success(t("ui.dbf7f00f8e14"));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (item: AccountKey) => {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(await getTokenKey(item.id));
      toast.success(t("ui.1f5ce46711f5"));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  const confirmDelete = async () => {
    if (!remove || busy) return;
    setBusy(true);
    setActionError("");
    try {
      if (readBindings()[remove.id]?.length || selectedId === remove.id)
        throw Error(t("ui.4e3a3176dd7a"));
      await deleteAccountKey(remove.id);
      setRemove(null);
      toast.success(t("ui.2789b0495e09"));
      await load();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const confirmApply = async () => {
    if (!apply || busy || !targets.length) return;
    setBusy(true);
    setActionError("");
    setResults(null);
    try {
      const current = await getAccountKey(apply.id);
      if (!usable(current)) throw Error(t("ui.2158b47a0242"));
      const plain = await getTokenKey(current.id);
      const outcome = await applyApiKeyToAgents(plain, targets);
      const checked = Object.fromEntries(
        targets.map((id) => [id, outcome[id] === true]),
      );
      setResults(checked);
      const successful = targets.filter((id) => checked[id]);
      for (const id of successful) {
        try {
          localStorage.setItem(
            `bound_token_${id}`,
            JSON.stringify({
              id: current.id,
              name: current.name,
              group: current.group,
            }),
          );
        } catch {
          /* Config was saved even if storage is unavailable. */
        }
      }
      window.dispatchEvent(
        new CustomEvent("ai_helper_sync_all_tokens", {
          detail: {
            id: current.id,
            name: current.name,
            group: current.group,
            key: plain,
            targets: successful,
          },
        }),
      );
      if (successful.length) {
        try {
          await setSelectedToken(current.id, current.name);
          await refreshState();
        } catch {
          setActionError(t("ui.f6d26aa5ae9e"));
        }
      }
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async (item: AccountKey) => {
    if (!selection) {
      setApply(item);
      setTargets([]);
      setResults(null);
      setActionError("");
      return;
    }
    setBusy(true);
    try {
      const current = await getAccountKey(item.id);
      if (!usable(current)) throw Error(t("ui.3d3253a7f4fb"));
      const plain = await getTokenKey(current.id);
      await selection.onSelectKey(plain, current);
      setSelectedId(current.id);
      try {
        await setSelectedToken(current.id, current.name);
        await refreshState();
      } catch {
        toast.error(t("ui.8e8fa6e7f6ef"));
      }
      selection.onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  const inspect = async (item: AccountKey) => {
    setBusy(true);
    try {
      setDetails(await getAccountKey(item.id));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  const checkConnection = async (item: AccountKey) => {
    setBusy(true);
    try {
      const models = await fetchCodexModels(
        await primaryApiEndpoint(),
        await getTokenKey(item.id),
      );
      toast.success(t("ui.26654cc05705", { v0: models.length }));
    } catch (e) {
      toast.error(t("ui.07d703881aca", { v0: String(e) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="w-full">
      <DataHeader
        title={t("nav.keys")}
        description={
          selection
            ? t("ui.1d9cb98a3c5b", { v0: selection.toolName })
            : t("ui.dc4c30667b22")
        }
        loading={loading}
        refresh={() => {
          void load();
          void loadRates();
        }}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setKeyword(search.trim());
          }}
        >
          <input
            className={fieldClass}
            aria-label={t("ui.2031dc0eb29a")}
            placeholder={t("ui.f675a305d806")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className={buttonClass} disabled={loading}>
            <Search size={14} />
            {t("ui.f04090805c6e")}
          </button>
        </form>
        <button
          className={buttonClass}
          disabled={busy}
          onClick={() => void openEditor()}
        >
          <Plus size={14} />
          {t("ui.f62300877ef2")}
        </button>
      </div>
      <DataState
        loading={loading}
        error={error}
        empty={!data?.items.length}
        retry={() => void load()}
      />
      {!loading && !error && !!data?.items.length && (
        <div className="space-y-3">
          {data.items.map((item) => {
            const inUse = selection
              ? selectedId === item.id
              : !!bindings[item.id]?.length;
            const protectedKey =
              !!bindings[item.id]?.length || selectedId === item.id;
            return (
              <article
                key={item.id}
                className={
                  cardClass +
                  " p-4 " +
                  (inUse
                    ? "!border-blue-500/40 !bg-blue-50/60 dark:!bg-[#202b35]"
                    : "")
                }
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <KeyRound size={15} className="text-blue-500" />
                      <h2 className="break-all text-sm font-semibold">
                        {item.name || t("ui.ab8ad61dac76", { v0: item.id })}
                      </h2>
                      <span
                        className={`text-[11px] ${usable(item) ? "text-emerald-500" : "text-amber-500"}`}
                      >
                        {statusNames[item.status] || t("ui.4e72a1ffe5bf")}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-xs text-slate-500">
                      {item.key}
                    </p>
                    {!!bindings[item.id]?.length && (
                      <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                        {t("feature.boundTo", {
                          tools: bindings[item.id].join(", "),
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={
                        inUse
                          ? t("ui.1b3b0fa5860a", { v0: item.name })
                          : t("ui.a274c04a0a2a", { v0: item.name })
                      }
                      hint={
                        !usable(item)
                          ? t("ui.008c2113667a")
                          : inUse
                            ? selection
                              ? t("ui.444570379a34", { v0: selection.toolName })
                              : t("ui.2311876a1847", {
                                  v0: bindings[item.id].join("、"),
                                })
                            : selection
                              ? t("ui.492ceb7cb790", { v0: selection.toolName })
                              : t("ui.647f6103bb36")
                      }
                      className={
                        inUse ? "!w-auto gap-1.5 px-2 !text-blue-500" : ""
                      }
                      disabled={busy || !usable(item)}
                      onClick={() => void choose(item)}
                    >
                      {inUse ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span className="text-xs">
                            {t("ui.e6aa2cbd7b42")}
                          </span>
                        </>
                      ) : (
                        <Play size={16} />
                      )}
                    </IconButton>
                    <IconButton
                      label={t("ui.a6aff3c08291", { v0: item.name })}
                      disabled={busy}
                      onClick={() => void openEditor(item)}
                    >
                      <Pencil size={16} />
                    </IconButton>
                    <ActionMenu
                      label={t("ui.ed66d8d82375", { v0: item.name })}
                      disabled={busy}
                      actions={[
                        {
                          label: t("ui.c00294f6b721"),
                          icon: <Copy size={15} />,
                          action: () => void copy(item),
                        },
                        {
                          label: t("ui.0ab148c9f546"),
                          icon: <Activity size={15} />,
                          action: () => void checkConnection(item),
                        },
                        {
                          label: t("ui.0938c3e80a24"),
                          icon: <SlidersHorizontal size={15} />,
                          action: () => void inspect(item),
                        },
                        ...(showLogs
                          ? [
                              {
                                label: t("ui.30a7c56681cb"),
                                icon: <ScrollText size={15} />,
                                action: () => showLogs(item.name),
                              },
                            ]
                          : []),
                        {
                          label:
                            item.status === 1
                              ? t("ui.84545d5b6e70")
                              : t("ui.1474b23a774c"),
                          icon: <Power size={15} />,
                          action: () => void changeStatus(item),
                          separator: true,
                        },
                        {
                          label: t("ui.8017614a477c"),
                          icon: <Trash2 size={15} />,
                          action: () => {
                            setActionError("");
                            setRemove(item);
                          },
                          danger: true,
                          disabled: protectedKey,
                          description: protectedKey
                            ? t("ui.590a1ded84f4")
                            : undefined,
                        },
                      ]}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span>
                    {t("message.e3d7bac6a669", {
                      v0: item.group
                        ? groupName(item.group)
                        : t("ui.c8d09cf955f5"),
                    })}
                  </span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {t("keys.groupRate")}：{groupRate(item.group)}
                  </span>

                  <span>
                    {t("message.bfbf621062fa", {
                      v0: item.unlimited_quota
                        ? t("ui.c34e52dd632a")
                        : `$${(item.remain_quota / 500000).toFixed(2)}`,
                    })}
                  </span>
                  <span>
                    {t("message.89a024e9c57c", {
                      v0:
                        item.expired_time === -1
                          ? t("ui.40975243bf1a")
                          : new Date(item.expired_time * 1000).toLocaleString(
                              "zh-CN",
                              { hour12: false },
                            ),
                    })}
                  </span>
                </div>
              </article>
            );
          })}
          <Pagination
            page={page}
            total={data.total}
            size={10}
            setPage={setPage}
          />
        </div>
      )}
      {details && (
        <DetailDialog title={t("ui.0938c3e80a24")} close={close}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 break-all">
            <dt>{t("ui.1be7ae4fc257")}</dt>
            <dd>{details.name}</dd>
            <dt>{t("ui.97d8a6c05b4c")}</dt>
            <dd>
              {details.group ? groupName(details.group) : t("ui.c8d09cf955f5")}
            </dd>
            <dt>{t("keys.groupRate")}</dt>
            <dd className="text-blue-600 dark:text-blue-400">
              {groupRate(details.group)}
            </dd>
            <dt>{t("ui.531e2faa2bb5")}</dt>
            <dd>
              {details.unlimited_quota
                ? t("ui.c34e52dd632a")
                : `$${(details.remain_quota / 500000).toFixed(4)}`}
            </dd>
            <dt>{t("ui.e20511f0a900")}</dt>
            <dd>
              {details.model_limits_enabled
                ? details.model_limits || t("ui.905ea1472e74")
                : t("ui.204f25ffa1a6")}
            </dd>
            <dt>{t("ui.da9ddabf8434")}</dt>
            <dd className="whitespace-pre-wrap">
              {details.allow_ips || t("ui.204f25ffa1a6")}
            </dd>
            <dt>{t("ui.222460c095e3")}</dt>
            <dd>
              {details.expired_time === -1
                ? t("ui.40975243bf1a")
                : new Date(details.expired_time * 1000).toLocaleString("zh-CN")}
            </dd>
          </dl>
        </DetailDialog>
      )}
      {edit && (
        <DetailDialog
          title={edit.id ? t("ui.14b4bff71aa9") : t("ui.f62300877ef2")}
          close={close}
        >
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
              <label className="block space-y-2">
                <span>{t("ui.1be7ae4fc257")}</span>
                <input
                  required
                  maxLength={50}
                  className={fieldClass + " w-full"}
                  value={edit.form.name}
                  onChange={(e) => setForm({ name: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span>{t("ui.97d8a6c05b4c")}</span>
                  <select
                    required={edit.id === null}
                    aria-label={t("ui.97d8a6c05b4c")}
                    className={fieldClass + " w-full"}
                    value={edit.form.group}
                    onChange={(e) => setForm({ group: e.target.value })}
                  >
                    <option value="" disabled>
                      {t("keys.chooseGroup")}
                    </option>
                    {[
                      ...new Set([
                        ...(groups ? Object.keys(groups.groups) : []),
                        ...(edit.form.group ? [edit.form.group] : []),
                      ]),
                    ].map((g) => (
                      <option key={g} value={g}>
                        {groupName(g)} · {groupRate(g)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span>{t("ui.ebddb4883eae")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.000002"
                    disabled={edit.form.unlimited_quota}
                    className={fieldClass + " w-full"}
                    value={edit.form.remain_quota / 500000}
                    onChange={(e) =>
                      setForm({
                        remain_quota: Math.round(
                          Number(e.target.value) * 500000,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              {edit.form.group && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {t("keys.groupRate")}：{groupRate(edit.form.group)}
                </p>
              )}

              {groupError && (
                <p className="text-xs text-amber-500">
                  {t("message.2cdfc7458546", { v0: groupError })}
                </p>
              )}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={edit.form.unlimited_quota}
                  onChange={(e) =>
                    setForm({ unlimited_quota: e.target.checked })
                  }
                />
                {t("ui.b26f37b7f521")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={edit.form.expired_time === -1}
                  onChange={(e) =>
                    setForm({
                      expired_time: e.target.checked
                        ? -1
                        : Math.floor(Date.now() / 1000) + 86400 * 30,
                    })
                  }
                />
                {t("ui.0070ca2601d4")}
              </label>
              {edit.form.expired_time !== -1 && (
                <label className="block space-y-2">
                  <span>{t("ui.3144a998f054")}</span>
                  <input
                    type="datetime-local"
                    required
                    className={fieldClass}
                    value={dateInput(edit.form.expired_time)}
                    onChange={(e) => {
                      if (e.target.value)
                        setForm({
                          expired_time: Date.parse(e.target.value) / 1000,
                        });
                    }}
                  />
                </label>
              )}
              {edit.form.group === "auto" && (
                <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <p className="text-xs text-slate-500">
                    {t("message.12af46d75a30", {
                      v0: groups
                        ? t("ui.b881ca2721d1", { v0: groups.auto.max_count })
                        : "",
                    })}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      ...new Set([
                        ...(groups?.auto.groups ?? []),
                        ...edit.form.auto_groups,
                      ]),
                    ].map((g) => (
                      <label
                        key={g}
                        className="flex items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={edit.form.auto_groups.includes(g)}
                          onChange={(e) =>
                            setForm({
                              auto_groups: e.target.checked
                                ? [...edit.form.auto_groups, g]
                                : edit.form.auto_groups.filter((v) => v !== g),
                            })
                          }
                        />
                        {groupName(g)} · {groupRate(g)}
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={edit.form.cross_group_retry}
                      onChange={(e) =>
                        setForm({ cross_group_retry: e.target.checked })
                      }
                    />
                    {t("ui.ed6e417af6c4")}
                  </label>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-xs text-slate-500">
                  {t("ui.e5974bf38614")}
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={edit.form.model_limits_enabled}
                      onChange={(e) =>
                        setForm({ model_limits_enabled: e.target.checked })
                      }
                    />
                    {t("ui.cb29fb3b45b6")}
                  </label>
                  <label className="block space-y-2">
                    <span>{t("ui.c88ba894f866")}</span>
                    <textarea
                      className={fieldClass + " w-full"}
                      value={edit.form.model_limits}
                      onChange={(e) =>
                        setForm({ model_limits: e.target.value })
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <span>{t("ui.99f7f9ee2a72")}</span>
                    <textarea
                      className={fieldClass + " w-full"}
                      value={edit.form.allow_ips}
                      onChange={(e) => setForm({ allow_ips: e.target.value })}
                    />
                  </label>
                </div>
              </details>
            </fieldset>
            {actionError && (
              <p role="alert" className="text-xs text-red-500">
                {actionError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={close}
              >
                {t("common.cancel")}
              </button>
              <button className={buttonClass} disabled={busy}>
                {busy ? t("ui.9ca32f988d16") : t("ui.cdfb82b464c9")}
              </button>
            </div>
          </form>
        </DetailDialog>
      )}
      {remove && (
        <DetailDialog title={t("ui.8017614a477c")} close={close}>
          <p>{t("message.7d79b3914d9d", { v0: remove.name })}</p>
          {actionError && (
            <p role="alert" className="text-red-500">
              {actionError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className={buttonClass} disabled={busy} onClick={close}>
              {t("common.cancel")}
            </button>
            <button
              className={buttonClass + " text-red-500"}
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {t("ui.3c06abe11651")}
            </button>
          </div>
        </DetailDialog>
      )}
      {apply && (
        <DetailDialog title={t("ui.d8b2a504d43c")} close={close}>
          <p className="text-sm">
            {t("message.71b28bd5efb3", { v0: apply.name })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {agents.map((agent) => (
              <label
                key={agent.id}
                className={cardClass + " flex items-center gap-3 p-4"}
              >
                <input
                  type="checkbox"
                  checked={targets.includes(agent.id)}
                  disabled={busy}
                  onChange={(e) => {
                    setResults(null);
                    setTargets((old) =>
                      e.target.checked
                        ? [...old, agent.id]
                        : old.filter((id) => id !== agent.id),
                    );
                  }}
                />
                {agent.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">{t("ui.25d32b7d69ec")}</p>
          {results && (
            <div role="status" className="space-y-2">
              {Object.entries(results).map(([id, ok]) => (
                <p
                  key={id}
                  className={ok ? "text-emerald-500" : "text-red-500"}
                >
                  {agents.find((a) => a.id === id)?.name}：
                  {ok ? t("ui.c99c6952b48a") : t("ui.1eeadb31a65c")}
                </p>
              ))}
            </div>
          )}
          {actionError && (
            <p role="alert" className="text-xs text-red-500">
              {actionError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className={buttonClass} disabled={busy} onClick={close}>
              {t("common.close")}
            </button>
            <button
              className={buttonClass + " text-blue-500"}
              disabled={busy || !targets.length}
              onClick={() => void confirmApply()}
            >
              {busy
                ? t("ui.2e5195034342")
                : results
                  ? t("ui.2398afc12e0c")
                  : t("ui.5846e8fc54e8")}
            </button>
          </div>
        </DetailDialog>
      )}
    </section>
  );
}
