import { getLocale, t, useLocale } from "../lib/i18n";
import { useEffect, useState, type FormEvent } from "react";
import {
  Clock3,
  Globe2,
  LockKeyhole,
  Loader2,
  MapPin,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  changeAccountPassword,
  encryptPasswordWithRsa,
  getEncryptionKey,
  getPasswordVerification,
  getSecurityOverview,
  oauthAuthorize,
  revokeAccountSessions,
} from "../lib/api";
import { useAuth } from "../lib/useAuth";
import type {
  PasswordScope,
  SecurityOverview,
  VerificationRequirements,
} from "../lib/security";
import {
  buttonClass,
  cardClass,
  DataHeader,
  DataState,
  DetailDialog,
  fieldClass,
} from "./AccountDataUI";

function sessionDevice(userAgent?: string) {
  const ua = userAgent?.trim() || "";
  const desktop = ua.match(
    /^([^/\r\n]{1,80})\/([\w.+-]{1,40}) \((Windows|macOS|Linux)\)$/i,
  );
  if (
    desktop &&
    !/^(?:Mozilla|Chrome|Safari|Firefox|Edg)$/i.test(desktop[1].trim())
  ) {
    return {
      title: desktop[1].trim(),
      detail: `${desktop[3]} · v${desktop[2]}`,
      browser: false,
    };
  }

  const os = /Windows NT 10\.0/i.test(ua)
    ? "Windows 10/11"
    : /Mac OS X ([\d_]+)/i.test(ua)
      ? `macOS ${RegExp.$1.replace(/_/g, ".")}`
      : /Android ([\d.]+)/i.test(ua)
        ? `Android ${RegExp.$1}`
        : /iPhone OS ([\d_]+)/i.test(ua)
          ? `iOS ${RegExp.$1.replace(/_/g, ".")}`
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const browser = ua.match(/Edg\/([\d.]+)/i)
    ? `Microsoft Edge ${RegExp.$1.split(".")[0]}`
    : ua.match(/Chrome\/([\d.]+)/i)
      ? `Google Chrome ${RegExp.$1.split(".")[0]}`
      : ua.match(/Firefox\/([\d.]+)/i)
        ? `Firefox ${RegExp.$1.split(".")[0]}`
        : ua.match(/Version\/([\d.]+).*Safari/i)
          ? `Safari ${RegExp.$1.split(".")[0]}`
          : t("security.browser");

  return {
    title: browser,
    detail: os || ua || t("security.unknownDevice"),
    browser: true,
  };
}

const names: Record<string, string> = {
  get password() {
    return t("ui.33abf70fd5e2");
  },
  get "2fa"() {
    return t("ui.3e871d4679ea");
  },
  get session() {
    return t("ui.3e64beab8e46");
  },
  get oauth() {
    return t("ui.3db4a356dd9a");
  },
  get passkey() {
    return t("ui.cb6be3e573d8");
  },
};
export default function SecurityPanel() {
  useLocale();
  const { refreshState } = useAuth();
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [requirements, setRequirements] =
    useState<VerificationRequirements | null>(null);
  const [method, setMethod] = useState("");
  const [provider, setProvider] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [revoke, setRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const scope: PasswordScope =
    data?.user.has_password === false
      ? "account.password.set"
      : "account.password.change";
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getSecurityOverview());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const start = async () => {
    setFormError("");
    setRequirements(null);
    setEditing(true);
    setOldPassword("");
    setPassword("");
    setConfirm("");
    setCode("");
    try {
      const result = await getPasswordVerification(scope);
      setRequirements(result);
      const supported = result.methods.filter(
        (m) =>
          m.available &&
          ["password", "2fa", "session", "oauth"].includes(m.method),
      );
      setMethod(supported[0]?.method ?? "");
      setProvider(result.oauth_providers?.[0]?.slug ?? "");
    } catch (e) {
      setFormError(String(e));
    }
  };
  const close = () => {
    if (!busy) {
      setEditing(false);
      setOldPassword("");
      setPassword("");
      setConfirm("");
      setCode("");
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (Array.from(password).length < 8 || Array.from(password).length > 128) {
      setFormError(t("ui.ae2ba9329509"));
      return;
    }
    if (password !== confirm) {
      setFormError(t("ui.ffd9ff042fb9"));
      return;
    }
    if (scope === "account.password.change" && password === oldPassword) {
      setFormError(t("ui.17b3195adeb9"));
      return;
    }
    setBusy(true);
    try {
      let verification: Record<string, unknown> = { method };
      if (method === "oauth") {
        const proof = await oauthAuthorize(provider, scope);
        if (!("proof_token" in proof)) throw new Error(t("ui.cd1d33e759de"));
        verification = { proof_token: proof.proof_token };
      } else if (method === "password") {
        if (requirements?.password_encryption_enabled) {
          const key = await getEncryptionKey();
          if (!key.enabled || !key.public_key)
            throw new Error(t("ui.5f04c9619d1a"));
          verification.password_encrypted = await encryptPasswordWithRsa(
            oldPassword,
            key.public_key,
          );
          verification.encryption_key_id = key.kid;
        } else verification.password = oldPassword;
      } else if (method === "2fa") verification.code = code.trim();
      const result = await changeAccountPassword(
        password,
        oldPassword,
        scope,
        verification,
      );
      setEditing(false);
      setOldPassword("");
      setPassword("");
      setConfirm("");
      setCode("");
      toast.success(
        scope === "account.password.set"
          ? t("ui.6e951cf7658e")
          : t("ui.0898c069f679"),
      );
      if (result.notification_warning) toast.warning(t("ui.0d598ebf717c"));
      await refreshState();
      await load();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
    type = "password",
  ) => (
    <label className="flex flex-col gap-2 text-xs text-slate-500">
      {label}
      <input
        aria-label={label}
        required
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={fieldClass}
        disabled={busy}
      />
    </label>
  );
  return (
    <section className="w-full text-slate-700 dark:text-gray-300">
      <DataHeader
        title={t("ui.8bf435e8a8b5")}
        description={t("ui.96a18cdb4507")}
        loading={loading}
        refresh={() => void load()}
      />
      <DataState
        loading={loading}
        error={error}
        empty={false}
        retry={() => void load()}
      />
      {!loading && !error && data && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <article className={cardClass + " p-5"}>
              <LockKeyhole size={20} className="mb-4 text-blue-500" />
              <h2 className="text-sm font-semibold">{t("ui.1a317b137803")}</h2>
              <p className="my-3 text-xs text-slate-500">
                {data.user.has_password === false
                  ? t("ui.5d26196a1a2d")
                  : t("ui.066f360026fc")}
              </p>
              <button className={buttonClass} onClick={() => void start()}>
                {data.user.has_password === false
                  ? t("ui.364ecf157a60")
                  : t("ui.0ae20ac3af1b")}
              </button>
            </article>
            <article className={cardClass + " p-5"}>
              <ShieldCheck size={20} className="mb-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">{t("ui.4fb1be9fb33e")}</h2>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">{t("ui.f3ea4a2d6a44")}</dt>
                  <dd className="break-all">
                    {data.user.email || t("ui.3bf179d8d045")}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">{t("ui.847fc0697a39")}</dt>
                  <dd>
                    {data.twofa
                      ? data.twofa.enabled
                        ? t("ui.d78cde076b67")
                        : t("ui.b9004e6f7bb1")
                      : t("ui.4c0521ff69ec")}
                  </dd>
                </div>
                {data.twofa?.enabled && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t("ui.278b92d85092")}</dt>
                    <dd>{data.twofa.backup_codes_remaining ?? "—"}</dd>
                  </div>
                )}
              </dl>
              {data.twofa_error && (
                <p className="mt-3 text-xs text-amber-500">
                  {data.twofa_error}
                </p>
              )}
            </article>
          </div>
          <article className={cardClass + " p-5"}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Monitor size={16} />
                {t("ui.ea2f3e734fa4")}
              </h2>
              <button
                className={buttonClass}
                disabled={
                  !data.sessions?.some((s) => !s.current && !s.is_current)
                }
                onClick={() => setRevoke("all")}
              >
                {t("ui.f310f5202529")}
              </button>
            </div>
            {data.sessions_error ? (
              <p className="text-xs text-amber-500">{data.sessions_error}</p>
            ) : !data.sessions?.length ? (
              <p className="text-xs text-slate-500">{t("ui.d6cdec7f0774")}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.sessions.map((session) => {
                  const device = sessionDevice(session.user_agent);
                  const current = session.current || session.is_current;
                  const activeAt =
                    session.last_active_at || session.last_seen_at || 0;
                  return (
                    <div
                      key={session.sid}
                      className={`min-w-0 border bg-slate-50/70 p-4 dark:bg-white/[0.025] ${current ? "border-emerald-300 dark:border-emerald-400/30" : "border-slate-200/80 dark:border-white/10"}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center border ${device.browser ? "border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300" : "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300"}`}
                          >
                            {device.browser ? (
                              <Globe2 size={17} />
                            ) : (
                              <Monitor size={17} />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p
                              className="truncate text-xs font-semibold text-slate-900 dark:text-gray-100"
                              title={session.user_agent}
                            >
                              {device.title}
                            </p>
                            <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-gray-400">
                              {device.detail}
                            </p>
                          </div>
                        </div>
                        {current ? (
                          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 bg-emerald-500" />
                            {t("ui.d426cddb15d7")}
                          </span>
                        ) : (
                          <button
                            className={
                              buttonClass +
                              " h-7 shrink-0 border-rose-200 px-2 text-[10px] text-rose-600 hover:bg-rose-50 dark:border-rose-400/20 dark:text-rose-300 dark:hover:bg-rose-400/10"
                            }
                            onClick={() => setRevoke(session.sid)}
                          >
                            {t("ui.feecb1e6adec")}
                          </button>
                        )}
                      </div>
                      <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500 dark:border-white/10 dark:text-gray-400 sm:grid-cols-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <MapPin size={12} className="shrink-0" />
                          <span className="truncate font-mono">
                            {session.ip || t("ui.dc8f36b8216a")}
                          </span>
                        </span>
                        {activeAt > 0 && (
                          <span className="inline-flex min-w-0 items-center gap-1.5 sm:justify-end">
                            <Clock3 size={12} className="shrink-0" />
                            <span className="whitespace-nowrap tabular-nums">
                              {new Date(activeAt * 1000).toLocaleString(
                                getLocale(),
                              )}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        </div>
      )}
      {editing && (
        <DetailDialog
          title={
            scope === "account.password.set"
              ? t("ui.1ef3fd2de593")
              : t("ui.321d9d86f688")
          }
          close={close}
        >
          <form onSubmit={submit} className="space-y-4">
            {(scope === "account.password.change" || method === "password") &&
              field(
                t("ui.33abf70fd5e2"),
                oldPassword,
                setOldPassword,
                "current-password",
              )}
            {field(t("ui.d22c9c008539"), password, setPassword, "new-password")}
            {field(t("ui.d4477adb6f8a"), confirm, setConfirm, "new-password")}
            {requirements ? (
              <>
                <label className="flex flex-col gap-2 text-xs text-slate-500">
                  {t("ui.b86ef7c8f5a5")}
                  <select
                    aria-label={t("ui.b86ef7c8f5a5")}
                    className={fieldClass}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    disabled={busy}
                  >
                    {requirements.methods
                      .filter(
                        (m) =>
                          m.available &&
                          ["password", "2fa", "session", "oauth"].includes(
                            m.method,
                          ),
                      )
                      .map((m) => (
                        <option key={m.method} value={m.method}>
                          {names[m.method]}
                        </option>
                      ))}
                  </select>
                </label>
                {method === "2fa" &&
                  field(
                    t("ui.8b5c237b8a3d"),
                    code,
                    setCode,
                    "one-time-code",
                    "text",
                  )}
                {method === "oauth" && (
                  <label className="flex flex-col gap-2 text-xs text-slate-500">
                    {t("ui.20cc10a5b750")}
                    <select
                      aria-label={t("ui.20cc10a5b750")}
                      className={fieldClass}
                      disabled={busy}
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      {requirements.oauth_providers
                        ?.filter((p) =>
                          [
                            "github",
                            "google",
                            "discord",
                            "linuxdo",
                            "oidc",
                          ].includes(p.slug),
                        )
                        .map((p) => (
                          <option key={p.slug} value={p.slug}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {!method && (
                  <p className="text-xs text-amber-500">
                    {t("ui.8a1411281810")}
                  </p>
                )}
              </>
            ) : (
              !formError && (
                <p className="text-xs text-slate-500">{t("ui.dfb53b28e620")}</p>
              )
            )}
            <p className="text-xs leading-6 text-slate-500">
              {t("ui.1caebc97ad8c")}
            </p>
            {formError && (
              <p role="alert" className="break-words text-xs text-red-500">
                {formError}
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
              <button
                type="submit"
                className={
                  buttonClass + " bg-blue-500 text-white hover:bg-blue-600"
                }
                disabled={
                  busy ||
                  !requirements ||
                  !method ||
                  (method === "oauth" && !provider)
                }
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {t("ui.b56d9ac6c5a0")}
                {scope === "account.password.set"
                  ? t("settings.title")
                  : t("ui.c9c77517fe85")}
              </button>
            </div>
          </form>
        </DetailDialog>
      )}
      {revoke && (
        <DetailDialog
          title={t("ui.7ca992989789")}
          close={() => {
            if (!revoking) setRevoke(null);
          }}
        >
          <p className="text-sm">
            {revoke === "all" ? t("ui.4a42ca373c8f") : t("ui.dbbe38165855")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              className={buttonClass}
              disabled={revoking}
              onClick={() => setRevoke(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              className={buttonClass + " text-red-500"}
              disabled={revoking}
              onClick={async () => {
                setRevoking(true);
                try {
                  await revokeAccountSessions(
                    revoke === "all" ? undefined : revoke,
                  );
                  setRevoke(null);
                  toast.success(t("ui.7a326dcc7f4b"));
                  await load();
                } catch (e) {
                  toast.error(String(e));
                } finally {
                  setRevoking(false);
                }
              }}
            >
              {revoking && <Loader2 size={14} className="animate-spin" />}
              {t("ui.515ce419ba07")}
            </button>
          </div>
        </DetailDialog>
      )}
    </section>
  );
}
