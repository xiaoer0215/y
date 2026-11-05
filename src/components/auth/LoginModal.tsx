import { t, useLocale } from "../../lib/i18n";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  User,
  Lock,
  Loader2,
  X,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  ArrowRight,
  Power,
} from "lucide-react";
import { toast } from "sonner";
import { SiGithub, SiGoogle, SiDiscord } from "react-icons/si";
import { exit } from "@tauri-apps/plugin-process";
import { Input } from "../ui/input";
import { SlideCaptchaModal } from "./SlideCaptchaModal";
import AccountEnrollment from "./AccountEnrollment";
import { BrandLogo } from "../BrandIcons";
import {
  getSiteStatus,
  getEncryptionKey,
  encryptPasswordWithRsa,
  loginAccount,
  login2fa,
  isTauri,
  oauthAuthorize,
} from "../../lib/api";
import type {
  UserInfo,
  LoginPayload,
  SiteStatus,
  LoginResult,
} from "../../types";

interface LoginModalProps {
  open: boolean;
  mandatory?: boolean;
  onSuccess: (user: UserInfo) => void;
  onClose: () => void;
  onExitApp?: () => void;
}

export function LoginModal({
  open,
  mandatory = false,
  onSuccess,
  onClose,
  onExitApp,
}: LoginModalProps) {
  useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [site, setSite] = useState<SiteStatus | null>(null);
  const [siteError, setSiteError] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [oauthBusy, setOauthBusy] = useState("");
  const [compatibility, setCompatibility] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setSiteError("");
    getSiteStatus()
      .then((status) => {
        if (active) setSite(status);
      })
      .catch((e) => {
        if (active) setSiteError(String(e));
      });
    return () => {
      active = false;
    };
  }, [open]);

  // 滑块弹窗状态
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [preparedLoginPayload, setPreparedLoginPayload] =
    useState<LoginPayload | null>(null);
  const preparedLoginPayloadRef = useRef<LoginPayload | null>(null);

  // 2FA 流程状态
  const [twoFaFlowToken, setTwoFaFlowToken] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaSubmitting, setTwoFaSubmitting] = useState(false);

  const acceptLogin = (result: LoginResult) => {
    if (result.type === "require_2fa") {
      setTwoFaFlowToken(result.flow_token);
      setMode("login");
    } else {
      setPassword("");
      setTwoFaFlowToken(null);
      setTwoFaCode("");
      preparedLoginPayloadRef.current = null;
      setPreparedLoginPayload(null);
      toast.success(
        t("ui.b12c2a0b0a1e", {
          v0: result.user.display_name || result.user.username,
        }),
      );
      onSuccess(result.user);
      onClose();
    }
  };
  const quickLogin = async (provider: string) => {
    if (oauthBusy) return;
    setOauthBusy(provider);
    setErrorMsg(null);
    try {
      const result = await oauthAuthorize(provider, undefined, compatibility);
      if ("type" in result) acceptLogin(result);
      else throw new Error(t("ui.26c61581fb44"));
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setOauthBusy("");
    }
  };

  if (!open || typeof document === "undefined") return null;

  // 提交第一阶段登录预备（检查密码加密并唤起滑块）
  const handleStartLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg(t("ui.4e74bc10a1fb"));
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. 检查站点配置
      const status = await getSiteStatus();
      if (!status.password_login_enabled) {
        throw new Error(t("ui.9e774da340e3"));
      }

      // 2. 密码加密适配
      let encryptedPwd: string | undefined;
      let kid: string | undefined;

      if (status.password_login_encryption_enabled) {
        const encData = await getEncryptionKey();
        if (encData.enabled && encData.public_key) {
          encryptedPwd = await encryptPasswordWithRsa(
            password,
            encData.public_key,
          );
          kid = encData.kid;
        }
      }

      const payload: LoginPayload = {
        username: username.trim(),
        password: encryptedPwd ? undefined : password,
        password_encrypted: encryptedPwd,
        encryption_key_id: kid,
      };

      preparedLoginPayloadRef.current = payload;
      setPreparedLoginPayload(payload);

      // 3. 判断是否需要完成 GO 滑块
      if (status.slide_captcha_check) {
        setCaptchaOpen(true);
      } else {
        // 不需要滑块则直接提交登录
        await doExecuteLogin(payload);
      }
    } catch (err: unknown) {
      const msg =
        typeof err === "string"
          ? err
          : (err as Error)?.message || t("ui.e6163f99773f");
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // 执行真实登录接口调用
  const doExecuteLogin = async (payload: LoginPayload) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await loginAccount(payload);

      acceptLogin(result);
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : t("ui.de23405b50c3");
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // 滑块通过后的回调
  const handleCaptchaSuccess = () => {
    setCaptchaOpen(false);
    const payload = preparedLoginPayloadRef.current || preparedLoginPayload;
    if (payload) {
      void doExecuteLogin(payload);
    }
  };

  // 提交 2FA 验证码
  const handle2FaSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!twoFaFlowToken || !twoFaCode.trim()) {
      setErrorMsg(t("ui.1f075a312f7a"));
      return;
    }

    setTwoFaSubmitting(true);
    setErrorMsg(null);

    try {
      const successData = await login2fa(twoFaFlowToken, twoFaCode.trim());
      setPassword("");
      setTwoFaFlowToken(null);
      setTwoFaCode("");
      preparedLoginPayloadRef.current = null;
      setPreparedLoginPayload(null);
      toast.success(t("ui.30ab53063a76", { v0: successData.user.username }));
      onSuccess(successData.user);
      onClose();
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : t("ui.fc1941aeb350");
      setErrorMsg(msg);
    } finally {
      setTwoFaSubmitting(false);
    }
  };

  const handleExitApp = async () => {
    if (onExitApp) {
      onExitApp();
      return;
    }
    try {
      if (isTauri) {
        await exit(0);
      } else {
        window.close();
      }
    } catch (e) {
      console.error("Exit failed:", e);
    }
  };

  return createPortal(
    <>
      <AnimatePresence>
        <div
          data-modal-blocking="true"
          className={`fixed inset-0 top-11 flex items-center justify-center p-4 select-none ${
            mandatory
              ? "z-[95] bg-slate-950/85 backdrop-blur-md"
              : "z-[90] bg-black/60 backdrop-blur-xs"
          }`}
          onClick={(e) => {
            // 强制模式下点击遮罩不关闭
            if (!mandatory && e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="relative grid w-full max-w-[780px] max-h-[calc(100vh_-_5rem)] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl dark:border-white/10 dark:bg-[#141724] dark:text-gray-200 sm:grid-cols-[230px_minmax(0,1fr)]"
          >
            <aside className="hidden flex-col justify-between overflow-hidden bg-[#10283a] p-7 text-white sm:flex">
              <div>
                <div className="flex h-12 w-12 items-center justify-center border border-white/15 bg-white/10">
                  <BrandLogo size={30} alt="Uocode Client" />
                </div>
                <div className="mt-6 text-[10px] font-semibold tracking-[0.18em] text-sky-300">
                  UOCODE
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Uocode <span className="text-sky-300">Client</span>
                </h2>
                <div className="mt-4 h-0.5 w-10 bg-sky-400" />
              </div>
              <div className="flex items-center gap-2 border-t border-white/15 pt-4 text-[11px] text-slate-300">
                <ShieldCheck size={14} className="text-emerald-300" />
                <span>{t("ui.4500709ede33")}</span>
              </div>
            </aside>
            <div className="max-h-[calc(100vh_-_5rem)] overflow-y-auto p-5 sm:p-7">
              {/* 顶栏控制 */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {twoFaFlowToken
                          ? t("ui.d49277e557b1")
                          : mode === "register"
                            ? t("ui.575f8f6ea6a2")
                            : mode === "reset"
                              ? t("ui.86c0969bc522")
                              : t("ui.4500709ede33")}
                      </h3>
                      {mandatory && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/30">
                          {t("ui.b4241c7df6eb")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-gray-500">
                      {twoFaFlowToken
                        ? t("ui.2d30bb32120b")
                        : mandatory
                          ? t("ui.323263688706")
                          : t("ui.a1b4e41eae38")}
                    </p>
                  </div>
                </div>
                {mandatory ? (
                  <button
                    type="button"
                    onClick={handleExitApp}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors cursor-pointer"
                    title={t("ui.408c0519bc50")}
                  >
                    <Power size={13} />
                    <span>{t("ui.c7df83309138")}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title={t("common.close")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* 错误提示条 */}
              {errorMsg && (
                <div className="mb-4 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-xl flex items-center gap-2 border border-red-200/50 dark:border-red-500/20">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span className="break-words">{errorMsg}</span>
                </div>
              )}

              {/* 2FA 输入视图 */}
              {mode !== "login" && site ? (
                <AccountEnrollment
                  key={mode}
                  mode={mode}
                  status={site}
                  back={(name) => {
                    setMode("login");
                    setErrorMsg(null);
                    if (name) setUsername(name);
                  }}
                />
              ) : twoFaFlowToken ? (
                <form onSubmit={handle2FaSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-gray-300">
                      {t("ui.ec195eede7b4")}
                    </label>
                    <div className="relative">
                      <KeyRound
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <Input
                        type="text"
                        value={twoFaCode}
                        onChange={(e) => setTwoFaCode(e.target.value)}
                        placeholder={t("ui.cfeed73b918f")}
                        autoFocus
                        maxLength={16}
                        className="pl-10 font-mono tracking-widest text-center text-sm font-semibold rounded-xl h-10 bg-slate-50 dark:bg-black/30 border-slate-200 dark:border-white/10"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTwoFaFlowToken(null);
                        setTwoFaCode("");
                      }}
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                    >
                      {t("ui.f2fe4ecc0f4b")}
                    </button>
                    <button
                      type="submit"
                      disabled={twoFaSubmitting || !twoFaCode.trim()}
                      className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
                    >
                      {twoFaSubmitting && (
                        <Loader2 size={13} className="animate-spin" />
                      )}
                      {t("ui.a74d29d39af1")}
                    </button>
                  </div>
                </form>
              ) : (
                /* 普通账号密码登录视图 */
                <form onSubmit={handleStartLogin} className="space-y-4">
                  {siteError && (
                    <p role="alert" className="text-xs text-red-500">
                      {siteError}
                      <button
                        type="button"
                        className="ml-2 text-blue-500"
                        onClick={() =>
                          void getSiteStatus()
                            .then((s) => {
                              setSite(s);
                              setSiteError("");
                            })
                            .catch((e) => setSiteError(String(e)))
                        }
                      >
                        {t("ui.e2d53a6d3a6a")}
                      </button>
                    </p>
                  )}
                  {!site && !siteError && (
                    <p className="text-xs text-slate-500">
                      {t("ui.50a587256ba9")}
                    </p>
                  )}
                  {site?.password_login_enabled !== false && (
                    <>
                      {/* 用户名 */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 dark:text-gray-300">
                          {t("ui.9a1d90ccbe52")}
                        </label>
                        <div className="relative">
                          <User
                            size={15}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                          />
                          <Input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={t("ui.27efbd024d31")}
                            autoFocus
                            disabled={loading}
                            className="pl-10 text-xs rounded-xl h-10 bg-slate-50 dark:bg-black/30 border-slate-200 dark:border-white/10"
                          />
                        </div>
                      </div>

                      {/* 密码 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-slate-700 dark:text-gray-300">
                            {t("ui.c839a8ff1788")}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              if (site) {
                                setMode("reset");
                                setErrorMsg(null);
                              }
                            }}
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            {t("ui.61d6593dc720")}
                          </button>
                        </div>
                        <div className="relative">
                          <Lock
                            size={15}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                          />
                          <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t("ui.1969133807c9")}
                            disabled={loading}
                            className="pl-10 text-xs rounded-xl h-10 bg-slate-50 dark:bg-black/30 border-slate-200 dark:border-white/10"
                          />
                        </div>
                      </div>

                      {/* 登录提交按钮 */}
                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={
                            loading ||
                            !!oauthBusy ||
                            !site ||
                            captchaOpen ||
                            !username.trim() ||
                            !password
                          }
                          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all cursor-pointer"
                        >
                          {loading ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>{t("ui.de9b0ce3f09a")}</span>
                            </>
                          ) : (
                            <>
                              <span>
                                {site?.slide_captcha_check
                                  ? t("ui.9ea08462f2a8")
                                  : t("ui.21f1e88275aa")}
                              </span>
                              <ArrowRight size={14} />
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                  {site &&
                    [
                      site.github_oauth,
                      site.google_oauth,
                      site.discord_oauth,
                      site.linuxdo_oauth,
                      site.oidc_enabled,
                    ].some(Boolean) && (
                      <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-white/10">
                        <p className="text-center text-[11px] text-slate-400">
                          {t("ui.619cd78924fa")}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            {
                              id: "github",
                              name: "GitHub",
                              enabled: site.github_oauth,
                            },
                            {
                              id: "google",
                              name: "Google",
                              enabled: site.google_oauth,
                            },
                            {
                              id: "discord",
                              name: "Discord",
                              enabled: site.discord_oauth,
                            },
                            {
                              id: "linuxdo",
                              name: "LinuxDO",
                              enabled: site.linuxdo_oauth,
                            },
                            {
                              id: "oidc",
                              name: site.oidc_display_name || "OIDC",
                              enabled: site.oidc_enabled,
                            },
                          ]
                            .filter((p) => p.enabled)
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                disabled={loading || !!oauthBusy}
                                onClick={() => void quickLogin(p.id)}
                                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
                              >
                                {oauthBusy === p.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : p.id === "github" ? (
                                  <SiGithub size={17} />
                                ) : p.id === "google" ? (
                                  <SiGoogle
                                    size={17}
                                    className="text-blue-500"
                                  />
                                ) : p.id === "discord" ? (
                                  <SiDiscord
                                    size={18}
                                    className="text-indigo-500"
                                  />
                                ) : p.id === "linuxdo" ? (
                                  <svg
                                    aria-hidden="true"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                  >
                                    <defs>
                                      <clipPath id="linuxdo-circle">
                                        <circle cx="12" cy="12" r="11" />
                                      </clipPath>
                                    </defs>
                                    <g clipPath="url(#linuxdo-circle)">
                                      <path fill="#1c1c1e" d="M0 0h24v8H0z" />
                                      <path fill="#fff" d="M0 8h24v8H0z" />
                                      <path fill="#f5c542" d="M0 16h24v8H0z" />
                                    </g>
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r="11"
                                      fill="none"
                                      stroke="#888"
                                      strokeWidth=".5"
                                    />
                                  </svg>
                                ) : (
                                  <ShieldCheck size={17} />
                                )}
                                {p.name}
                              </button>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-[11px] text-slate-500">
                          <input
                            type="checkbox"
                            checked={compatibility}
                            disabled={!!oauthBusy}
                            onChange={(e) => setCompatibility(e.target.checked)}
                          />
                          {t("ui.b70490db6b4e")}
                        </label>
                        {oauthBusy && (
                          <p
                            role="status"
                            className="text-[11px] leading-5 text-slate-500"
                          >
                            {t("ui.c479a9524a24")}
                          </p>
                        )}
                      </div>
                    )}
                  {/* 底部注册通道 */}
                  {site?.register_enabled !== false &&
                    site?.password_register_enabled !== false &&
                    !site?.register_page_disabled &&
                    site && (
                      <div className="pt-2 text-center text-[11px] text-slate-400 dark:text-gray-500">
                        {t("ui.1e58e9e7ba61")}{" "}
                        <button
                          type="button"
                          disabled={!!oauthBusy || loading}
                          onClick={() => {
                            setMode("register");
                            setErrorMsg(null);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          {t("ui.575f8f6ea6a2")}
                        </button>
                      </div>
                    )}
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* 滑块验证组件 */}
      <SlideCaptchaModal
        open={captchaOpen}
        onSuccess={handleCaptchaSuccess}
        onClose={() => setCaptchaOpen(false)}
      />
    </>,
    document.body,
  );
}

export default LoginModal;
