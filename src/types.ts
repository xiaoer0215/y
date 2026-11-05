export interface AgentConfig {
  base_url: string;
  api_key: string;
  model: string;
  config_exists: boolean;
  config_path: string;
  is_installed: boolean;
  app_path?: string | null;
}

export interface TopupPaymentMethod {
  name?: string;
  type: string;
  color?: string;
  icon?: string;
  min_topup?: string | number;
  id?: string;
  waffo_index?: number;
  product_id?: string;
  fixed_amount?: number;
  fixed_price?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface TopupInfo {
  amount_options?: number[];
  pay_methods?: TopupPaymentMethod[];
  min_topup?: number;
  stripe_min_topup?: number;
  waffo_min_topup?: number;
  waffo_pancake_min_topup?: number;
  enable_online_topup?: boolean;
  enable_stripe_topup?: boolean;
  enable_creem_topup?: boolean;
  enable_waffo_topup?: boolean;
  enable_waffo_pancake_topup?: boolean;
  waffo_pay_methods?: unknown;
  creem_products?: unknown;
  processing_fee_methods?: unknown;
  processing_fee_tiers?: unknown;
  discount?: Record<string, number>;
  discounted_price?: Record<string, number>;
  gift?: Record<string, number>;
  processing_fee_threshold?: number;
  processing_fee_amount?: number;
  processing_fee_rate?: number;
  [key: string]: unknown;
}

export interface TopupPaymentResult {
  success?: boolean;
  message?: string;
  url?: string;
  data?: Record<string, unknown> | string | null;
  [key: string]: unknown;
}

export interface NetworkStatus {
  reachable: boolean;
  target_url?: string;
  status_code?: number;
  latency_ms?: number;
  error_message?: string;
}

export interface AppPathsConfig {
  claude_cli_path?: string | null;
  codex_cli_path?: string | null;
  chatgpt_client_path?: string | null;
  workbuddy_client_path?: string | null;
  accio_client_path?: string | null;
}

export interface DetectedPathInfo {
  app_type: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork";
  path: string;
  exists: boolean;
  source: string;
  is_running: boolean;
  extra_info?: string | null;
}

export interface AppInstallerInfo {
  app_type: "chatgpt" | "workbuddy" | "acciowork";
  app_name: string;
  version: string;
  download_url: string;
  file_name: string;
  size_bytes?: number | null;
  is_external_store: boolean;
  store_uri?: string | null;
  winget_command?: string | null;
  official_web_url?: string | null;
}

export type AppDownloadEvent =
  | { event: "Started"; data: { totalBytes?: number; fileName: string } }
  | {
      event: "Progress";
      data: { downloaded: number; totalBytes: number; percent: number };
    }
  | { event: "Finished"; data: { filePath: string } }
  | { event: "Error"; data: { message: string } };

export type InitStepId = "network" | "paths" | "config" | "confirm";
export type StepStatus = "pending" | "running" | "success" | "error";

export interface InitStepInfo {
  id: InitStepId;
  title: string;
  description: string;
  status: StepStatus;
  error?: string;
}

export interface ApiTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
  latencyMs?: number;
  responsePreview?: string;
}

export type TestStreamEvent =
  | {
      type: "log";
      data: {
        text: string;
        level: "info" | "success" | "warn" | "error" | "response" | "dim";
      };
    }
  | {
      type: "chunk";
      data: {
        delta: string;
      };
    }
  | {
      type: "finish";
      data: {
        success: boolean;
        message: string;
        latency_ms: number;
        status_code?: number;
      };
    };

export interface FetchedModel {
  id: string;
  ownedBy: string | null;
}

export const CODEX_MODEL_SUGGESTIONS = [
  "gpt-5.2-codex",
  "gpt-5.1-codex",
  "gpt-5-codex",
  "gpt-4.1",
] as const;

export const CLAUDE_MODEL_SUGGESTIONS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
] as const;

export const WORKBUDDY_MODEL_SUGGESTIONS = [
  "gpt-5.6-sol",
  "gpt-4o",
  "gpt-4o-mini",
  "o1",
  "o3-mini",
  "chatgpt-4o-latest",
] as const;

export const ACCIO_MODEL_SUGGESTIONS = [
  "claude-3-7-sonnet",
  "claude-3-5-sonnet",
  "gpt-4o",
  "gpt-4.1-mini",
  "deepseek-r1",
  "deepseek-v3",
  "qwen-2.5-max",
] as const;

export interface WorkbuddyModelItem {
  id: string;
  name: string;
  vendor: string;
  url: string;
  api?: string;
  apiKey?: string;
  supportsToolCall?: boolean;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
  onlyReasoning?: boolean;
  useCustomProtocol?: boolean;
  reasoning?: {
    supportedEfforts?: string[];
    defaultEffort?: string;
    canDisableThinking?: boolean;
  };
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  temperature?: number | null;
  disabled?: boolean;
}

export interface WorkbuddyUIConfig extends AgentConfig {
  supports_tool_call: boolean;
  supports_images: boolean;
  supports_reasoning: boolean;
  only_reasoning: boolean;
  can_disable_thinking: boolean;
  use_custom_protocol: boolean;
  default_effort: string;
  supported_efforts: string[];
  max_input_tokens?: number | null;
  max_output_tokens?: number | null;
  configured_models: WorkbuddyModelItem[];
}

export interface WorkbuddySavePayload {
  url: string;
  api_key: string;
  model: string;
  supports_tool_call: boolean;
  supports_images: boolean;
  supports_reasoning: boolean;
  only_reasoning: boolean;
  can_disable_thinking: boolean;
  use_custom_protocol: boolean;
  default_effort?: string | null;
  supported_efforts: string[];
  max_input_tokens?: number | null;
  max_output_tokens?: number | null;
}

export interface AccioConfig {
  base_url: string;
  api_key: string;
  model: string;
  bridge_port: number;
  official_gateway: string;
  fallback_official: boolean;
  prevent_official_leak: boolean;
  auto_start_bridge?: boolean;
  cached_models?: string[];
  config_exists?: boolean;
  config_path?: string;
  is_installed?: boolean;
  app_path?: string | null;
  bridge_running?: boolean;
  actual_port?: number | null;
}

export interface AccioBridgeStatus {
  is_running: boolean;
  port?: number | null;
}

// ── 用户认证与 API Key 凭据类型定义 (PRD 桌面登录方案 B) ──

export interface SiteStatus {
  api_endpoints?: unknown;
  user_group_display_names?: Record<string, string>;
  user_group_display_names_localized?: Record<
    string,
    import("./lib/site-content").GroupDisplayName
  >;
  register_enabled?: boolean;
  password_register_enabled?: boolean;
  register_page_disabled?: boolean;
  email_verification?: boolean;
  turnstile_check?: boolean;
  github_oauth?: boolean;
  google_oauth?: boolean;
  discord_oauth?: boolean;
  linuxdo_oauth?: boolean;
  oidc_enabled?: boolean;
  oidc_display_name?: string;
  custom_oauth_providers?: { slug: string; name: string }[];
  announcements?: Announcement[];
  announcements_enabled?: boolean;
  top_notice_enabled?: boolean;
  top_notice_items?: {
    id?: number;
    content?: string;
    contentZh?: string;
    content_zh?: string;
    contentEn?: string;
    content_en?: string;
    startAt: string;
    endAt?: string;
    type?: string;
    routes?: string[];
  }[];
  terms_of_service_enabled?: boolean;
  user_agreement_enabled?: boolean;
  privacy_policy_enabled?: boolean;
  quota_display_type?: string;
  custom_currency_symbol?: string | null;
  password_login_enabled: boolean;
  password_login_encryption_enabled: boolean;
  captcha_enabled: boolean;
  captcha_type?: string | null;
  slide_captcha_check: boolean;
}

export interface Announcement {
  id: number | string;
  content: string;
  extra?: string;
  publishDate?: string;
  type?: string;
}

export interface EncryptionKeyData {
  enabled: boolean;
  kid: string;
  public_key: string;
}

export interface CaptchaGenerateData {
  captcha_id: string;
  master_image: string;
  tile_image: string;
  master_width: number;
  master_height: number;
  tile_width: number;
  tile_height: number;
  thumb_display_x: number;
  thumb_display_y: number;
}

export interface UserInfo {
  id: number;
  username: string;
  display_name?: string | null;
}

export interface LoginPayload {
  username: string;
  password?: string | null;
  password_encrypted?: string | null;
  encryption_key_id?: string | null;
}

export interface TwoFaRequirement {
  require_2fa: boolean;
  flow_token: string;
  expires_at: number;
}

export interface LoginSuccessData {
  user: UserInfo;
  access_token: string;
  access_expires_at: number;
  session_sid?: string | null;
}

export type LoginResult =
  | {
      type: "success";
      user: UserInfo;
      access_token: string;
      access_expires_at: number;
      session_sid?: string | null;
    }
  | {
      type: "require_2fa";
      require_2fa: boolean;
      flow_token: string;
      expires_at: number;
    };

export interface TokenItem {
  id: number;
  name: string;
  key: string;
  status: number; // 1: 正常可用, 2: 已禁用, 3: 已过期, 4: 额度耗尽
  expired_time: number;
  unlimited_quota: boolean;
  remain_quota: number;
  group?: string | null;
}

export interface CurrentAuthState {
  is_logged_in: boolean;
  user?: UserInfo | null;
  selected_token_id?: number | null;
  selected_token_name?: string | null;
  access_token_expires_at?: number | null;
}

export interface ChannelTrendPoint {
  timestamp: number;
  success_rate: number;
  avg_response_time: number;
  has_data: boolean;
  total_requests: number;
  failed_requests: number;
  is_synthetic?: boolean;
}

export interface ChannelGroupOverview {
  group_name: string;
  success_rate: number;
  avg_response_time: number;
  has_successful_requests: boolean;
  total_requests: number;
  failed_requests: number;
  trend_points: ChannelTrendPoint[];
}

export interface ChannelGroupOverviewResult {
  groups: ChannelGroupOverview[];
  monitoring_available: boolean;
}

export interface UserWalletInfo {
  quota: number; // 剩余额度点数 (500000 = $1)
  used_quota: number; // 已用额度点数
  quota_usd: number; // 美元余额 ($)
  quota_cny: number; // 人民币余额，账号额度按 1:1 显示
  used_quota_usd: number; // 已消耗美元 ($)
  used_quota_cny: number; // 已消耗人民币 (￥)
  request_count: number; // 请求次数
  group?: string | null; // 用户分组 (如 "svip", "default")
  quota_per_unit: number; // 每单位额度 (500000)
  rmb_to_usd_rate: number; // 账号额度比例，1:1
}
