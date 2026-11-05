import { BRAND } from "../../lib/brand";
import { t, useLocale } from "../../lib/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { openUrl, registerAccount, sendAccountEmail } from "../../lib/api";
import type { SiteStatus } from "../../types";
import { buttonClass, fieldClass } from "../AccountDataUI";
import { SlideCaptchaModal } from "./SlideCaptchaModal";

export default function AccountEnrollment({
  mode,
  status,
  back,
}: {
  mode: "register" | "reset";
  status: SiteStatus;
  back: (username?: string) => void;
}) {
  useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [aff, setAff] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [captcha, setCaptcha] = useState(false);
  const cooldown = Math.max(0, Math.ceil((deadline - now) / 1000));
  const legal = status.user_agreement_enabled || status.privacy_policy_enabled;
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  const send = async () => {
    if (!email.trim() || cooldown || sending) return;
    setError("");
    setSending(true);
    try {
      await sendAccountEmail(email.trim(), mode);
      setNow(Date.now());
      setDeadline(Date.now() + 60000);
      if (mode === "reset") setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  };
  const execute = async () => {
    setBusy(true);
    setError("");
    try {
      await registerAccount({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        verification_code: code.trim() || undefined,
        aff_code: aff.trim() || undefined,
      });
      setPassword("");
      setConfirm("");
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "reset") {
      void send();
      return;
    }
    if (password !== confirm) {
      setError(t("ui.072efaae2009"));
      return;
    }
    if (Array.from(password).length < 8 || Array.from(password).length > 128) {
      setError(t("ui.5ab1aa3b4ae0"));
      return;
    }
    if (status.slide_captcha_check) setCaptcha(true);
    else void execute();
  };
  const input = (
    label: string,
    value: string,
    set: (v: string) => void,
    type = "text",
    required = true,
    autoComplete?: string,
  ) => (
    <label className="flex flex-col gap-1.5 text-xs text-slate-500">
      {label}
      <input
        aria-label={label}
        className={fieldClass}
        type={type}
        required={required}
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={busy}
        autoComplete={autoComplete}
        maxLength={
          autoComplete === "username" ? 20 : type === "password" ? 128 : 254
        }
      />
    </label>
  );
  if (done)
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="rounded-xl bg-emerald-500/10 p-4 text-xs leading-7 text-emerald-600 dark:text-emerald-400"
        >
          {mode === "register" ? t("ui.ec11267d8771") : t("ui.9ee4cdf7fde3")}
        </p>
        <button
          className={buttonClass + " w-full"}
          onClick={() => back(mode === "register" ? username : undefined)}
        >
          {t("ui.f2fe4ecc0f4b")}
        </button>
      </div>
    );
  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <>
            {input(
              t("ui.a1aaf352cb07"),
              username,
              setUsername,
              "text",
              true,
              "username",
            )}
            {input(
              t("ui.412fe5d51eb8"),
              password,
              setPassword,
              "password",
              true,
              "new-password",
            )}
            {input(
              t("ui.1d0167f69320"),
              confirm,
              setConfirm,
              "password",
              true,
              "new-password",
            )}
          </>
        )}
        {(mode === "reset" || status.email_verification) &&
          input(t("ui.9ed627bcf63d"), email, setEmail, "email", true, "email")}
        {mode === "register" && status.email_verification && (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              {input(
                t("ui.0a2d3e165504"),
                code,
                setCode,
                "text",
                true,
                "one-time-code",
              )}
            </div>
            <button
              type="button"
              className={buttonClass + " shrink-0"}
              disabled={
                busy ||
                sending ||
                cooldown > 0 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
              }
              onClick={() => void send()}
            >
              {sending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : cooldown ? (
                t("ui.c35a19398a97", { v0: cooldown })
              ) : (
                t("ui.42e8edb226ec")
              )}
            </button>
          </div>
        )}
        {mode === "register" && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">{t("ui.d744aca665fe")}</summary>
            <div className="pt-2">
              {input(t("ui.dd2d739f0076"), aff, setAff, "text", false)}
            </div>
          </details>
        )}
        {mode === "register" && legal && (
          <label className="flex items-start gap-2 text-[11px] leading-5 text-slate-500">
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1"
            />
            <span>
              {t("ui.141d8c4dfcfe")}
              {status.user_agreement_enabled && (
                <button
                  type="button"
                  className="text-blue-500"
                  onClick={() =>
                    void openUrl(`${BRAND.siteUrl}/user-agreement`)
                  }
                >
                  {t("ui.8f31a480bd68")}
                </button>
              )}
              {status.privacy_policy_enabled && (
                <button
                  type="button"
                  className="text-blue-500"
                  onClick={() =>
                    void openUrl(`${BRAND.siteUrl}/privacy-policy`)
                  }
                >
                  {t("ui.a09ce12ef35b")}
                </button>
              )}
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="break-words text-xs text-red-500">
            {error}
          </p>
        )}
        <button
          type="submit"
          className={
            buttonClass + " w-full bg-blue-600 text-white hover:bg-blue-700"
          }
          disabled={
            busy ||
            sending ||
            captcha ||
            (mode === "register" && !!legal && !agreed) ||
            (mode === "reset" && cooldown > 0)
          }
        >
          {(busy || sending) && <Loader2 size={14} className="animate-spin" />}
          {mode === "register" ? t("ui.575f8f6ea6a2") : t("ui.9c68e05fb0a0")}
        </button>
        <button
          type="button"
          className={buttonClass + " w-full"}
          disabled={busy}
          onClick={() => back()}
        >
          {t("ui.f2fe4ecc0f4b")}
        </button>
      </form>
      <SlideCaptchaModal
        open={captcha}
        onClose={() => setCaptcha(false)}
        onSuccess={() => {
          setCaptcha(false);
          void execute();
        }}
      />
    </>
  );
}
