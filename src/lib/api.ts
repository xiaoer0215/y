import { getLocale, t } from "./i18n";
import { invoke as tauriInvoke, Channel } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { normalizeKeyGroups } from "./keys";
import type {
  PricingCatalog,
  UsageQuery,
  UsagePage,
  WalletBillPage,
  WalletBillQuery,
  SupportTicketDetail,
  SupportTicketPage,
} from "./account-data";
import type {
  AgentConfig,
  ApiTestResult,
  AppPathsConfig,
  DetectedPathInfo,
  FetchedModel,
  NetworkStatus,
  TestStreamEvent,
  WorkbuddyUIConfig,
  WorkbuddySavePayload,
  WorkbuddyModelItem,
  AccioConfig,
  AccioBridgeStatus,
  SiteStatus,
  EncryptionKeyData,
  CaptchaGenerateData,
  LoginPayload,
  LoginSuccessData,
  LoginResult,
  TokenItem,
  CurrentAuthState,
  ChannelGroupOverviewResult,
  UserWalletInfo,
  TopupInfo,
  TopupPaymentResult,
  AppInstallerInfo,
  AppDownloadEvent,
} from "../types";

export const isTauri =
  typeof window !== "undefined" &&
  Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__,
  );

function getMockResponse<T>(cmd: string, _args?: Record<string, unknown>): T {
  switch (cmd) {
    case "register_account":
    case "send_account_email":
    case "change_account_password":
    case "revoke_account_sessions":
    case "oauth_authorize":
    case "save_account_key":
    case "set_account_key_status":
    case "delete_account_key":
      throw new Error(t("ui.374cda050da1"));
    case "get_site_notice":
      return "" as T;
    case "list_account_keys":
      return {
        items: [],
        total: 0,
        page: _args?.page ?? 1,
        page_size: 10,
      } as T;
    case "get_key_groups":
      return { groups: {}, auto: { groups: [], max_count: 0 } } as T;
    case "get_account_key":
      throw new Error(t("ui.fbc5e577d50c"));
    case "get_security_overview":
      return {
        user: { has_password: true },
        sessions: [],
        twofa: { enabled: false },
      } as T;
    case "get_password_verification":
      return {
        scope: _args?.scope,
        methods: [{ method: "password", available: true }],
      } as T;
    case "get_pricing_catalog":
      return { data: [], vendors: [], group_ratio: {}, usable_group: {} } as T;
    case "get_usage_logs":
      return { items: [], total: 0, page: 1, page_size: 20 } as T;
    case "get_ticket_list":
      return { items: [], total: 0, page: 1, page_size: 10 } as T;
    case "get_ticket_detail":
      throw new Error(t("ticket.selectTicket"));
    case "create_ticket":
    case "reply_ticket":
    case "close_ticket":
    case "mark_ticket_read":
      return {} as T;
    case "get_ticket_summary":
      return { unread_count: 0, has_unread: false } as T;
    case "check_bob_api_network":
      return {
        reachable: true,
        latency_ms: 45,
        checked_at: Date.now(),
      } as unknown as T;
    case "get_codex_config":
      return {
        config_exists: true,
        config_path: "~/.codex/config.toml",
        base_url: "",
        api_key: "",
        model: "gpt-5.6-sol",
      } as unknown as T;
    case "get_claude_config":
      return {
        config_exists: true,
        config_path: "~/.claude/settings.json",
        base_url: "",
        api_key: "",
        model: "claude-3-7-sonnet",
      } as unknown as T;
    case "get_workbuddy_config":
      return {
        config_exists: true,
        config_path: "~/.workbuddy/models.json",
        configured_models: [],
      } as unknown as T;
    case "get_accio_config":
      return {
        config_exists: true,
        config_path: "~/.ai-helper/accio_config.json",
        base_url: "",
        api_key: "",
        model: "claude-3-7-sonnet",
        bridge_port: 8787,
        official_gateway: "https://phoenix-gw.alibaba.com",
        fallback_official: false,
        prevent_official_leak: true,
        is_installed: false,
        bridge_running: false,
      } as unknown as T;
    case "get_accio_bridge_status":
      return { is_running: false, port: 8787 } as unknown as T;
    case "start_accio_bridge":
      return 8787 as unknown as T;
    case "stop_accio_bridge":
      return undefined as unknown as T;
    case "get_app_paths":
      return {
        claude: null,
        codex: null,
        chatgpt: null,
        workbuddy: null,
        accio: null,
      } as unknown as T;
    case "detect_all_app_paths":
      return [] as unknown as T;
    case "fetch_codex_models":
    case "fetch_claude_models":
      return [
        { id: "gpt-5.6-sol", name: "gpt-5.6-sol" },
        { id: "claude-3-7-sonnet", name: "claude-3-7-sonnet" },
      ] as unknown as T;
    case "get_site_status":
      return {
        register_enabled: true,
        password_register_enabled: true,
        email_verification: true,
        github_oauth: true,
        google_oauth: true,
        discord_oauth: true,
        linuxdo_oauth: true,
        announcements: [],
        password_login_enabled: true,
        password_login_encryption_enabled: false,
        captcha_enabled: true,
        captcha_type: "slide",
        slide_captcha_check: true,
      } as unknown as T;
    case "get_encryption_key":
      return {
        enabled: false,
        kid: "",
        public_key: "",
      } as unknown as T;
    case "generate_captcha":
      return {
        captcha_id: "mock-captcha-id",
        master_image:
          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='220'><rect width='300' height='220' fill='%231e293b'/><circle cx='100' cy='100' r='50' fill='%2338bdf8'/><text x='150' y='120' font-size='18' fill='white' text-anchor='middle'>Mock Captcha</text></svg>",
        tile_image:
          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='70' height='70'><rect width='70' height='70' fill='%2338bdf8' rx='8'/></svg>",
        master_width: 300,
        master_height: 220,
        tile_width: 70,
        tile_height: 70,
        thumb_display_x: 0,
        thumb_display_y: 65,
      } as unknown as T;
    case "verify_captcha":
      return undefined as unknown as T;
    case "login_account":
      return {
        type: "success",
        user: {
          id: 1,
          username: (_args?.payload as LoginPayload)?.username || "mock_user",
          display_name: "Mock User",
        },
        access_token: "mock-token",
        access_expires_at: Math.floor(Date.now() / 1000) + 86400,
        session_sid: "mock-sid",
      } as unknown as T;
    case "get_auth_state":
      return {
        is_logged_in: false,
        user: null,
      } as unknown as T;
    case "get_user_tokens":
      return [
        {
          id: 101,
          name: t("ui.dfbb4ca344eb"),
          key: "sk-mock***101",
          status: 1,
          expired_time: -1,
          unlimited_quota: true,
          remain_quota: 0,
          group: "default",
        },
        {
          id: 102,
          name: t("ui.d93110e7d2fd"),
          key: "sk-mock***102",
          status: 1,
          expired_time: -1,
          unlimited_quota: true,
          remain_quota: 0,
          group: "vip",
        },
      ] as unknown as T;
    case "get_token_key":
      return "sk-mock-plain-key-for-preview" as unknown as T;
    case "update_user_token_group": {
      const tokenId = (_args?.tokenId as number) || 101;
      const newGroup = (_args?.newGroup as string) || "default";
      return {
        id: tokenId,
        name: "Mock Key",
        key: "sk-mock***" + tokenId,
        status: 1,
        expired_time: -1,
        unlimited_quota: true,
        remain_quota: 0,
        group: newGroup,
      } as unknown as T;
    }
    case "get_channel_group_overview":
      return {
        monitoring_available: true,
        groups: [
          {
            group_name: "SVIP-codex",
            success_rate: 100,
            avg_response_time: 1.25,
            has_successful_requests: true,
            total_requests: 120,
            failed_requests: 0,
            trend_points: Array.from({ length: 12 }, (_, i) => ({
              timestamp: Math.floor(Date.now() / 1000) - (11 - i) * 300,
              success_rate: 100,
              avg_response_time: 1.2,
              has_data: true,
              total_requests: 10,
              failed_requests: 0,
            })),
          },
          {
            group_name: "ClaudeCode Kiro-1",
            success_rate: 98.5,
            avg_response_time: 2.1,
            has_successful_requests: true,
            total_requests: 85,
            failed_requests: 1,
            trend_points: Array.from({ length: 12 }, (_, i) => ({
              timestamp: Math.floor(Date.now() / 1000) - (11 - i) * 300,
              success_rate: 98.5,
              avg_response_time: 2.1,
              has_data: true,
              total_requests: 7,
              failed_requests: 0,
            })),
          },
        ],
      } as unknown as T;
    case "get_user_wallet":
      return {
        quota: 227002749,
        used_quota: 302207438,
        quota_usd: 454.01,
        quota_cny: 454.01,
        used_quota_usd: 604.41,
        used_quota_cny: 604.41,
        request_count: 20540,
        group: "svip",
        quota_per_unit: 500000,
        rmb_to_usd_rate: 1.0,
      } as unknown as T;
    case "get_topup_info":
      return {
        amount_options: [10, 20, 50, 100, 200, 500, 1000],
        min_topup: 1,
        enable_online_topup: true,
        pay_methods: [
          { name: t("ui.66f1177d677b"), type: "alipay", color: "#1677ff" },
          { name: t("ui.64aeba8fbc56"), type: "wxpay", color: "#07c160" },
        ],
        discounted_price: {},
      } as unknown as T;
    case "get_wallet_bills":
      return {
        items: [],
        total: 0,
        page:
          _args?.query && typeof _args.query === "object"
            ? ((_args.query as { p?: number }).p ?? 1)
            : 1,
        page_size:
          _args?.query && typeof _args.query === "object"
            ? ((_args.query as { page_size?: number }).page_size ?? 20)
            : 20,
      } as unknown as T;
    case "request_topup_payment":
      return {
        success: true,
        url: "https://www.uocode.com/wallet",
      } as unknown as T;
    case "calculate_topup_amount":
      return String(_args?.amount ?? 0) as unknown as T;
    case "open_payment_form":
      return undefined as unknown as T;
    case "open_url":
      if (_args && typeof _args.url === "string") {
        window.open(_args.url, "_blank");
      }
      return true as unknown as T;
    case "fetch_latest_installer_info": {
      const appType = (_args?.appType as string) || "acciowork";
      if (appType === "chatgpt") {
        return {
          app_type: "chatgpt",
          app_name: "ChatGPT",
          version: t("ui.7bf8d5fffbee"),
          download_url: "https://apps.microsoft.com/detail/9NT1R1C2HH7J",
          file_name: "ChatGPT (Microsoft Store)",
          size_bytes: null,
          is_external_store: true,
          store_uri: "ms-windows-store://pdp/?productid=9NT1R1C2HH7J",
          winget_command:
            "winget install --id=9NT1R1C2HH7J --source=msstore --accept-package-agreements --accept-source-agreements",
          official_web_url: "https://chatgpt.com/download",
        } as unknown as T;
      } else if (appType === "workbuddy") {
        return {
          app_type: "workbuddy",
          app_name: "WorkBuddy",
          version: "v5.7.6",
          download_url:
            "https://download.codebuddy.cn/workbuddy/saas/win32-x64-user/WorkBuddy-win32-x64-user-5.7.6.40409493-306add2a.exe",
          file_name: "WorkBuddy-win32-x64-user-5.7.6.exe",
          size_bytes: 125000000,
          is_external_store: false,
          official_web_url: "https://www.workbuddy.cn",
        } as unknown as T;
      } else {
        return {
          app_type: "acciowork",
          app_name: "Accio Work",
          version: "v0.34.5",
          download_url:
            "https://work-download.accio.com/package/v0.34.5/Accio-0.34.5-20261013-0010-win.exe?dl_name=Accio-0.34.5-20261013-0010-win_ec130b61.exe",
          file_name: "Accio-0.34.5-Setup.exe",
          size_bytes: 156000000,
          is_external_store: false,
          official_web_url: "https://www.accio.com/work",
        } as unknown as T;
      }
    }
    case "run_installer_file":
    case "show_file_in_folder":
    case "open_system_uri":
      return undefined as unknown as T;
    default:
      return undefined as unknown as T;
  }
}

async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri) {
    return getMockResponse<T>(cmd, args);
  }
  const result = await tauriInvoke<T>(cmd, args);
  const agent = (
    {
      set_codex_config: "codex",
      set_claude_config: "claude",
      set_workbuddy_config: "workbuddy",
      set_accio_config: "acciowork",
    } as Record<string, string>
  )[cmd];
  if (agent)
    window.dispatchEvent(
      new CustomEvent("local-config-saved", { detail: agent }),
    );
  return result;
}

export async function getAppPaths(): Promise<AppPathsConfig> {
  return invoke<AppPathsConfig>("get_app_paths");
}

export async function saveAppPaths(config: AppPathsConfig): Promise<void> {
  return invoke("save_app_paths", { config });
}

export async function detectAppPath(
  appType: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork",
): Promise<DetectedPathInfo> {
  return invoke<DetectedPathInfo>("detect_app_path", { appType });
}

export async function detectAllAppPaths(): Promise<DetectedPathInfo[]> {
  return invoke<DetectedPathInfo[]>("detect_all_app_paths");
}

export async function browseAppPath(
  appType: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork",
): Promise<string | null> {
  return invoke<string | null>("browse_app_path", { appType });
}

export async function checkAppProcessStatus(
  appType: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork",
): Promise<boolean> {
  return invoke<boolean>("check_app_process_status", { appType });
}

export async function restartTargetApp(
  appType: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork",
  customPath?: string,
): Promise<string> {
  return invoke<string>("restart_target_app", { appType, customPath });
}

export async function getCodexConfig(): Promise<AgentConfig> {
  return invoke<AgentConfig>("get_codex_config");
}

export async function setCodexConfig(
  url: string,
  apiKey: string,
  model?: string,
): Promise<void> {
  return invoke("set_codex_config", { url, apiKey, model });
}

export async function getClaudeConfig(): Promise<AgentConfig> {
  return invoke<AgentConfig>("get_claude_config");
}

export async function setClaudeConfig(
  url: string,
  apiKey: string,
  model?: string,
): Promise<void> {
  return invoke("set_claude_config", { url, apiKey, model });
}

export async function getWorkbuddyConfig(): Promise<WorkbuddyUIConfig> {
  return invoke<WorkbuddyUIConfig>("get_workbuddy_config");
}

export async function setWorkbuddyConfig(
  payload: WorkbuddySavePayload,
): Promise<void> {
  return invoke("set_workbuddy_config", { payload });
}

export async function deleteWorkbuddyModel(
  modelId: string,
): Promise<WorkbuddyModelItem[]> {
  return invoke<WorkbuddyModelItem[]>("delete_workbuddy_model", { modelId });
}

export async function checkBobApiNetwork(): Promise<NetworkStatus> {
  return invoke<NetworkStatus>("check_bob_api_network");
}

export async function testCodexConfig(
  url: string,
  apiKey: string,
  model: string,
): Promise<ApiTestResult> {
  return invoke<ApiTestResult>("test_codex_config", {
    url,
    apiKey,
    model,
  });
}

export async function testClaudeConfig(
  url: string,
  apiKey: string,
  model: string,
): Promise<ApiTestResult> {
  return invoke<ApiTestResult>("test_claude_config", {
    url,
    apiKey,
    model,
  });
}

export async function testCodexStream(
  url: string,
  apiKey: string,
  model: string,
  onEvent: (event: TestStreamEvent) => void,
): Promise<ApiTestResult> {
  if (!isTauri) {
    onEvent({
      type: "log",
      data: { text: t("ui.4257f381314f"), level: "info" },
    });
    onEvent({
      type: "finish",
      data: {
        success: true,
        message: t("ui.156a21e33d08"),
        latency_ms: 60,
        status_code: 200,
      },
    });
    return {
      success: true,
      message: t("ui.156a21e33d08"),
      latencyMs: 60,
      statusCode: 200,
    };
  }
  const channel = new Channel<TestStreamEvent>(onEvent);
  return invoke<ApiTestResult>("test_codex_stream", {
    url,
    apiKey,
    model,
    onEvent: channel,
  });
}

export async function testClaudeStream(
  url: string,
  apiKey: string,
  model: string,
  onEvent: (event: TestStreamEvent) => void,
): Promise<ApiTestResult> {
  if (!isTauri) {
    onEvent({
      type: "log",
      data: {
        text: t("ui.53133839746f"),
        level: "info",
      },
    });
    onEvent({
      type: "finish",
      data: {
        success: true,
        message: t("ui.156a21e33d08"),
        latency_ms: 60,
        status_code: 200,
      },
    });
    return {
      success: true,
      message: t("ui.156a21e33d08"),
      latencyMs: 60,
      statusCode: 200,
    };
  }
  const channel = new Channel<TestStreamEvent>(onEvent);
  return invoke<ApiTestResult>("test_claude_stream", {
    url,
    apiKey,
    model,
    onEvent: channel,
  });
}

export async function testWorkbuddyStream(
  url: string,
  apiKey: string,
  model: string,
  onEvent: (event: TestStreamEvent) => void,
): Promise<ApiTestResult> {
  if (!isTauri) {
    onEvent({
      type: "log",
      data: {
        text: t("ui.58dff42eba80"),
        level: "info",
      },
    });
    onEvent({
      type: "finish",
      data: {
        success: true,
        message: t("ui.156a21e33d08"),
        latency_ms: 60,
        status_code: 200,
      },
    });
    return {
      success: true,
      message: t("ui.156a21e33d08"),
      latencyMs: 60,
      statusCode: 200,
    };
  }
  const channel = new Channel<TestStreamEvent>(onEvent);
  return invoke<ApiTestResult>("test_workbuddy_stream", {
    url,
    apiKey,
    model,
    onEvent: channel,
  });
}

export async function getAccioConfig(): Promise<AccioConfig> {
  return invoke<AccioConfig>("get_accio_config");
}

export async function setAccioConfig(config: AccioConfig): Promise<void> {
  return invoke("set_accio_config", { config });
}

export async function startAccioBridge(port?: number): Promise<number> {
  return invoke<number>("start_accio_bridge", { port });
}

export async function stopAccioBridge(): Promise<void> {
  return invoke<void>("stop_accio_bridge");
}

export async function getAccioBridgeStatus(): Promise<AccioBridgeStatus> {
  return invoke<AccioBridgeStatus>("get_accio_bridge_status");
}

export async function testAccioStream(
  url: string,
  apiKey: string,
  model: string,
  onEvent: (event: TestStreamEvent) => void,
): Promise<ApiTestResult> {
  if (!isTauri) {
    onEvent({
      type: "log",
      data: {
        text: t("ui.07b1a2870a14"),
        level: "info",
      },
    });
    onEvent({
      type: "finish",
      data: {
        success: true,
        message: t("ui.156a21e33d08"),
        latency_ms: 60,
        status_code: 200,
      },
    });
    return {
      success: true,
      message: t("ui.156a21e33d08"),
      latencyMs: 60,
      statusCode: 200,
    };
  }
  const channel = new Channel<TestStreamEvent>(onEvent);
  return invoke<ApiTestResult>("test_accio_stream", {
    url,
    apiKey,
    model,
    onEvent: channel,
  });
}

export async function fetchCodexModels(
  url: string,
  apiKey: string,
  agent: "codex" | "workbuddy" | "acciowork" = "codex",
): Promise<FetchedModel[]> {
  return invoke<FetchedModel[]>(
    agent === "codex" ? "fetch_codex_models" : "fetch_workspace_models",
    { url, apiKey, agent },
  );
}

export async function fetchClaudeModels(
  url: string,
  apiKey: string,
): Promise<FetchedModel[]> {
  return invoke<FetchedModel[]>("fetch_claude_models", { url, apiKey });
}

let lastOpenTime = 0;
let lastOpenUrl = "";

export async function openUrl(url: string): Promise<boolean> {
  const trimmed = url.trim();
  const now = Date.now();
  if (trimmed === lastOpenUrl && now - lastOpenTime < 800) {
    return true;
  }
  lastOpenTime = now;
  lastOpenUrl = trimmed;

  try {
    await invoke("open_url", { url: trimmed });
    return true;
  } catch (err) {
    console.error("Failed to open URL in browser:", err);
    toast.error(t("ui.46c6025aa795", { v0: String(err) }));
    return false;
  }
}

let lastOpenConfigTime = 0;
let lastOpenConfigPath = "";

export async function openConfigFile(path: string): Promise<boolean> {
  const trimmed = path.trim();
  if (!trimmed) {
    toast.error(t("ui.422c1e4e828d"));
    return false;
  }
  const now = Date.now();
  if (trimmed === lastOpenConfigPath && now - lastOpenConfigTime < 800) {
    return true;
  }
  lastOpenConfigTime = now;
  lastOpenConfigPath = trimmed;

  try {
    await invoke("open_config_file", { path: trimmed });
    return true;
  } catch (err) {
    console.error("Failed to open config file:", err);
    toast.error(t("ui.ce1dcf3dd236", { v0: String(err) }));
    return false;
  }
}

export async function executeInTerminal(command: string): Promise<string> {
  return invoke<string>("execute_in_terminal", { command });
}

export interface CandidateMirror {
  name: string;
  url: string;
}

export type UpdateDownloadEvent =
  | {
      event: "Started";
      data: {
        contentLength?: number;
        source: string;
      };
    }
  | {
      event: "Progress";
      data: {
        chunkLength: number;
        downloaded: number;
        totalBytes: number;
      };
    }
  | {
      event: "SwitchSource";
      data: {
        fromSource: string;
        toSource: string;
        reason: string;
      };
    }
  | {
      event: "Finished";
    };

export async function downloadAndInstallUpdate(
  version: string,
  onEvent: (event: UpdateDownloadEvent) => void,
): Promise<void> {
  if (!isTauri) {
    onEvent({
      event: "Started",
      data: { contentLength: 5000000, source: t("ui.390ecf6d691c") },
    });
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 200));
      onEvent({
        event: "Progress",
        data: {
          chunkLength: 1000000,
          downloaded: i * 1000000,
          totalBytes: 5000000,
        },
      });
    }
    onEvent({ event: "Finished" });
    return;
  }

  const channel = new Channel<UpdateDownloadEvent>(onEvent);
  return tauriInvoke<void>("download_and_install_update", {
    version,
    onEvent: channel,
  });
}

// ── 用户认证与 API Key 凭据管理接口 (PRD 桌面登录方案 B) ──

/**
 * 使用 Web Crypto API 实现符合 PRD 第 6.1 节规范的 RSA-OAEP (SHA-256) 密码加密
 */
export async function encryptPasswordWithRsa(
  password: string,
  publicKeyPem: string,
): Promise<string> {
  const b64 = publicKeyPem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const cryptoKey = await window.crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  );

  const enc = new TextEncoder();
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    cryptoKey,
    enc.encode(password),
  );

  return btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)));
}

export async function getSiteStatus(): Promise<SiteStatus> {
  return invoke<SiteStatus>("get_site_status");
}
export function getSiteNotice(): Promise<string> {
  return invoke("get_site_notice");
}

export function registerAccount(
  payload: import("./security").RegisterPayload,
): Promise<void> {
  return invoke("register_account", { payload });
}
export function sendAccountEmail(
  email: string,
  purpose: "register" | "reset",
): Promise<void> {
  return invoke("send_account_email", { email, purpose });
}
export function oauthAuthorize(
  provider: string,
  scope?: import("./security").PasswordScope,
  compatibility = false,
): Promise<LoginResult | { proof_token: string }> {
  return invoke("oauth_authorize", {
    provider,
    scope: scope ?? null,
    compatibility,
    locale: getLocale(),
  });
}
export function getSecurityOverview(): Promise<
  import("./security").SecurityOverview
> {
  return invoke("get_security_overview");
}
export function getPasswordVerification(
  scope: import("./security").PasswordScope,
): Promise<import("./security").VerificationRequirements> {
  return invoke("get_password_verification", { scope });
}
export function changeAccountPassword(
  password: string,
  originalPassword: string,
  scope: import("./security").PasswordScope,
  verification: Record<string, unknown>,
): Promise<{ notification_warning?: boolean }> {
  return invoke("change_account_password", {
    password,
    originalPassword,
    scope,
    verification,
  });
}
export function revokeAccountSessions(sid?: string): Promise<void> {
  return invoke("revoke_account_sessions", { sid: sid ?? null });
}

export async function getEncryptionKey(): Promise<EncryptionKeyData> {
  return invoke<EncryptionKeyData>("get_encryption_key");
}

export async function generateCaptcha(): Promise<CaptchaGenerateData> {
  return invoke<CaptchaGenerateData>("generate_captcha");
}

export async function verifyCaptcha(
  captchaId: string,
  x: number,
  y: number,
): Promise<void> {
  return invoke<void>("verify_captcha", { captchaId, x, y });
}

export async function loginAccount(
  payload: LoginPayload,
): Promise<LoginResult> {
  return invoke<LoginResult>("login_account", { payload });
}

export async function login2fa(
  flowToken: string,
  code: string,
): Promise<LoginSuccessData> {
  return invoke<LoginSuccessData>("login_2fa", { flowToken, code });
}

export async function getAuthState(): Promise<CurrentAuthState> {
  return invoke<CurrentAuthState>("get_auth_state");
}

export async function refreshAuthSession(): Promise<LoginSuccessData> {
  return invoke<LoginSuccessData>("refresh_auth_session");
}

export async function logoutAccount(): Promise<void> {
  return invoke<void>("logout_account");
}

export async function getUserTokens(): Promise<TokenItem[]> {
  return invoke<TokenItem[]>("get_user_tokens");
}
export function listAccountKeys(
  page: number,
  keyword: string,
): Promise<import("./keys").KeyPage> {
  return invoke("list_account_keys", { page, keyword });
}
export function getAccountKey(
  id: number,
): Promise<import("./keys").AccountKey> {
  return invoke("get_account_key", { id });
}
export async function getKeyGroups(): Promise<import("./keys").KeyGroups> {
  return normalizeKeyGroups(
    await invoke<import("./keys").RawKeyGroups>("get_key_groups"),
  );
}
export function saveAccountKey(
  id: number | null,
  form: import("./keys").KeyForm,
): Promise<void> {
  return invoke("save_account_key", { id, form });
}
export function setAccountKeyStatus(id: number, status: number): Promise<void> {
  return invoke("set_account_key_status", { id, status });
}
export function deleteAccountKey(id: number): Promise<void> {
  return invoke("delete_account_key", { id });
}

export async function getTokenKey(tokenId: number): Promise<string> {
  return invoke<string>("get_token_key", { tokenId });
}

export async function createUserToken(
  name: string,
  group?: string,
): Promise<TokenItem> {
  return invoke<TokenItem>("create_user_token", {
    name,
    group: group ?? null,
  });
}

export async function updateUserTokenGroup(
  tokenId: number,
  newGroup: string,
): Promise<TokenItem> {
  return invoke<TokenItem>("update_user_token_group", {
    tokenId,
    newGroup,
  });
}

export async function setSelectedToken(
  tokenId?: number | null,
  tokenName?: string | null,
): Promise<void> {
  return invoke<void>("set_selected_token", {
    tokenId: tokenId ?? null,
    tokenName: tokenName ?? null,
  });
}

export async function applyApiKeyToAgents(
  apiKey: string,
  targets: string[] = ["chatgpt", "claude", "workbuddy", "acciowork"],
): Promise<Record<string, boolean>> {
  const result = await invoke<Record<string, boolean>>(
    "apply_api_key_to_agents",
    {
      apiKey,
      targets,
    },
  );
  for (const [target, saved] of Object.entries(result)) {
    if (saved)
      window.dispatchEvent(
        new CustomEvent("local-config-saved", {
          detail: target === "chatgpt" ? "codex" : target,
        }),
      );
  }
  return result;
}

export async function getChannelGroupOverview(
  hours: number = 1,
): Promise<ChannelGroupOverviewResult> {
  return invoke<ChannelGroupOverviewResult>("get_channel_group_overview", {
    hours,
  });
}

export async function getUserWallet(): Promise<UserWalletInfo> {
  return invoke<UserWalletInfo>("get_user_wallet");
}

export function getPricingCatalog(): Promise<PricingCatalog> {
  return invoke<PricingCatalog>("get_pricing_catalog");
}

export function getUsageLogs(query: UsageQuery): Promise<UsagePage> {
  return invoke<UsagePage>("get_usage_logs", { query });
}

export function sendFeishuFeedback(payload: {
  webhook: string;
  title: string;
  details: string;
  contact?: string;
  appVersion: string;
}): Promise<void> {
  if (!isTauri) return Promise.reject(new Error("desktopOnly"));
  return invoke<void>("send_feishu_feedback", {
    webhook: payload.webhook,
    title: payload.title,
    details: payload.details,
    contact: payload.contact || null,
    appVersion: payload.appVersion,
  });
}

export function getWalletBills(
  query: WalletBillQuery,
): Promise<WalletBillPage> {
  return invoke<WalletBillPage>("get_wallet_bills", { query });
}

export function getTicketList(query: {
  p: number;
  page_size: number;
  status?: string;
  keyword?: string;
}): Promise<SupportTicketPage> {
  return invoke<SupportTicketPage>("get_ticket_list", { query });
}

export function getTicketDetail(
  ticketRef: string,
): Promise<SupportTicketDetail> {
  return invoke<SupportTicketDetail>("get_ticket_detail", { ticketRef });
}

export function createTicket(payload: {
  title: string;
  category: string;
  priority: string;
  content: string;
  images: string[];
}): Promise<SupportTicketDetail> {
  return invoke<SupportTicketDetail>("create_ticket", payload);
}

export function replyTicket(
  ticketRef: string,
  content: string,
  images: string[],
): Promise<SupportTicketDetail> {
  return invoke<SupportTicketDetail>("reply_ticket", {
    ticketRef,
    content,
    images,
  });
}

export function closeTicket(ticketRef: string): Promise<unknown> {
  return invoke("close_ticket", { ticketRef });
}

export function markTicketRead(ticketRef: string): Promise<unknown> {
  return invoke("mark_ticket_read", { ticketRef });
}

export function getTicketSummary(): Promise<{
  unread_count: number;
  has_unread: boolean;
}> {
  return invoke("get_ticket_summary");
}

export function uploadTicketImage(
  image: string,
  filename: string,
): Promise<string> {
  return invoke("upload_ticket_image", { image, filename });
}

export async function getTopupInfo(): Promise<TopupInfo> {
  return invoke<TopupInfo>("get_topup_info");
}

export async function requestTopupPayment(
  amount: number,
  paymentMethod: string,
  payMethodIndex?: number,
  productId?: string,
): Promise<TopupPaymentResult> {
  return invoke<TopupPaymentResult>("request_topup_payment", {
    amount,
    paymentMethod,
    payMethodIndex,
    productId,
  });
}

export async function calculateTopupAmount(
  amount: number,
  paymentMethod: string,
): Promise<unknown> {
  return invoke<unknown>("calculate_topup_amount", { amount, paymentMethod });
}

export async function openPaymentForm(
  url: string,
  fields: Record<string, string>,
): Promise<void> {
  return invoke<void>("open_payment_form", {
    url,
    fields,
    locale: getLocale(),
  });
}

export async function openPaymentWindow(url: string): Promise<void> {
  return invoke<void>("open_payment_window", { url, locale: getLocale() });
}

export async function fetchLatestInstallerInfo(
  appType: string,
): Promise<AppInstallerInfo> {
  return invoke<AppInstallerInfo>("fetch_latest_installer_info", { appType });
}

export async function downloadInstallerFile(
  appType: string,
  onEvent: (event: AppDownloadEvent) => void,
): Promise<string> {
  if (!isTauri) {
    onEvent({
      event: "Started",
      data: { totalBytes: 156000000, fileName: `${appType}-setup.exe` },
    });
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 400));
      onEvent({
        event: "Progress",
        data: {
          downloaded: i * 31200000,
          totalBytes: 156000000,
          percent: i * 20,
        },
      });
    }
    const mockPath = `C:\\Users\\User\\Downloads\\${appType}-setup.exe`;
    onEvent({ event: "Finished", data: { filePath: mockPath } });
    return mockPath;
  }

  const channel = new Channel<AppDownloadEvent>();
  channel.onmessage = (event) => {
    onEvent(event);
  };
  return tauriInvoke<string>("download_installer_file", {
    appType,
    onEvent: channel,
  });
}

export async function runInstallerFile(filePath: string): Promise<void> {
  return invoke("run_installer_file", { filePath });
}

export async function showFileInFolder(filePath: string): Promise<void> {
  return invoke("show_file_in_folder", { filePath });
}

export async function openSystemUri(uri: string): Promise<void> {
  return invoke("open_system_uri", { uri });
}
