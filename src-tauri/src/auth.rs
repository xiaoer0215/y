use log::error;
use reqwest::cookie::{CookieStore, Jar};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, ORIGIN};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

pub const BASE_URL: &str = "https://www.uocode.com";
pub const AUTH_ORIGIN: &str = "https://www.uocode.com";

fn desktop_user_agent() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        concat!(
            env!("AI_HELPER_BRAND_USER_AGENT_NAME"),
            "/",
            env!("CARGO_PKG_VERSION"),
            " (macOS)"
        )
    }
    #[cfg(target_os = "windows")]
    {
        concat!(
            env!("AI_HELPER_BRAND_USER_AGENT_NAME"),
            "/",
            env!("CARGO_PKG_VERSION"),
            " (Windows)"
        )
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        concat!(
            env!("AI_HELPER_BRAND_USER_AGENT_NAME"),
            "/",
            env!("CARGO_PKG_VERSION")
        )
    }
}

// ── 数据模型定义 ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteStatus {
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
    pub quota_display_type: String,
    pub custom_currency_symbol: Option<String>,
    pub password_login_enabled: bool,
    pub password_login_encryption_enabled: bool,
    pub captcha_enabled: bool,
    pub captcha_type: Option<String>,
    pub slide_captcha_check: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionKeyData {
    pub enabled: bool,
    pub kid: String,
    pub public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptchaGenerateData {
    pub captcha_id: String,
    pub master_image: String,
    pub tile_image: String,
    pub master_width: u32,
    pub master_height: u32,
    pub tile_width: u32,
    pub tile_height: u32,
    pub thumb_display_x: i32,
    pub thumb_display_y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub display_name: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub sid: String,
    #[serde(default)]
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: Option<String>,
    pub password_encrypted: Option<String>,
    pub encryption_key_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwoFaRequirement {
    pub require_2fa: bool,
    pub flow_token: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginSuccessData {
    pub user: UserInfo,
    pub access_token: String,
    pub access_expires_at: i64,
    pub session_sid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum LoginResult {
    #[serde(rename = "success")]
    Success(LoginSuccessData),
    #[serde(rename = "require_2fa")]
    Require2Fa(TwoFaRequirement),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenItem {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub key: String,
    #[serde(default = "default_status")]
    pub status: i32, // 1: active, 2: disabled, 3: expired, 4: quota exhausted
    #[serde(default = "default_neg_one")]
    pub expired_time: i64,
    #[serde(default)]
    pub unlimited_quota: bool,
    #[serde(default)]
    pub remain_quota: i64,
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChannelTrendPoint {
    #[serde(default)]
    pub timestamp: i64,
    #[serde(default)]
    pub success_rate: f64,
    #[serde(default)]
    pub avg_response_time: f64,
    #[serde(default)]
    pub has_data: bool,
    #[serde(default)]
    pub total_requests: i64,
    #[serde(default)]
    pub failed_requests: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChannelGroupOverview {
    pub group_name: String,
    #[serde(default)]
    pub success_rate: f64,
    #[serde(default)]
    pub avg_response_time: f64,
    #[serde(default)]
    pub has_successful_requests: bool,
    #[serde(default)]
    pub total_requests: i64,
    #[serde(default)]
    pub failed_requests: i64,
    #[serde(default)]
    pub trend_points: Vec<ChannelTrendPoint>,
}

#[derive(Debug, Serialize)]
pub struct ChannelGroupOverviewResult {
    pub groups: Vec<ChannelGroupOverview>,
    pub monitoring_available: bool,
}

static GROUP_MONITOR_UNAVAILABLE: AtomicBool = AtomicBool::new(false);

fn default_status() -> i32 {
    1
}
fn default_neg_one() -> i64 {
    -1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserWalletInfo {
    pub quota: i64,
    pub used_quota: i64,
    pub quota_usd: f64,
    pub quota_cny: f64,
    pub used_quota_usd: f64,
    pub used_quota_cny: f64,
    pub request_count: i64,
    pub group: Option<String>,
    pub quota_per_unit: i64,
    pub rmb_to_usd_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthSessionStorage {
    pub user: Option<UserInfo>,
    pub refresh_cookie: Option<String>,
    pub session_sid: Option<String>,
    pub selected_token_id: Option<i64>,
    pub selected_token_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentAuthState {
    pub is_logged_in: bool,
    pub user: Option<UserInfo>,
    pub selected_token_id: Option<i64>,
    pub selected_token_name: Option<String>,
    pub access_token_expires_at: Option<i64>,
}

// ── 服务端通用响应包装 ──

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    pub success: bool,
    #[serde(default)]
    pub message: String,
    pub data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct ApiRawTokenKeyData {
    pub key: String,
}

fn parse_api_response_body<T: serde::de::DeserializeOwned>(
    status: reqwest::StatusCode,
    text: &str,
    action_name: &str,
) -> Result<ApiResponse<T>, String> {
    let trimmed = text.trim();
    if trimmed.starts_with('<') {
        return Err(format!(
            "{action_name}遇到网络拦截 (收到 HTML 页面，HTTP {})，请检查网络或开启代理 / VPN 的 TUN 模式重试",
            status.as_u16()
        ));
    }

    if !status.is_success() {
        if let Ok(err_val) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if let Some(msg) = err_val.get("message").and_then(|m| m.as_str()) {
                if !msg.is_empty() {
                    return Err(msg.to_string());
                }
            }
        }
        return Err(format!(
            "{action_name}异常 (HTTP {}): {}",
            status.as_u16(),
            trimmed.chars().take(120).collect::<String>()
        ));
    }

    serde_json::from_str::<ApiResponse<T>>(trimmed).map_err(|e| {
        format!("解析{action_name}响应数据失败: {e} (若处于受限网络请检查代理设置或开启 TUN 模式)")
    })
}

// ── 内部认证状态管理器 ──

pub struct AuthManager {
    client: Client,
    cookie_jar: Arc<Jar>,
    access_token: Option<String>,
    access_expires_at: i64,
    current_user: Option<UserInfo>,
    session_sid: Option<String>,
    selected_token_id: Option<i64>,
    selected_token_name: Option<String>,
}

impl AuthManager {
    pub fn new() -> Self {
        let cookie_jar = Arc::new(Jar::default());
        let mut builder = Client::builder()
            .cookie_provider(cookie_jar.clone())
            .user_agent(desktop_user_agent())
            .timeout(Duration::from_secs(15))
            .no_proxy();

        let proxy = reqwest::Proxy::custom(|_url| {
            if let Some(proxy_str) = crate::updater::get_cached_upstream_proxy_url() {
                Url::parse(&proxy_str).ok()
            } else {
                None
            }
        });
        builder = builder.proxy(proxy);

        let client = builder
            .build()
            .expect("Failed to build reqwest client for auth");

        let mut mgr = Self {
            client,
            cookie_jar,
            access_token: None,
            access_expires_at: 0,
            current_user: None,
            session_sid: None,
            selected_token_id: None,
            selected_token_name: None,
        };

        // 尝试从本地恢复凭据
        mgr.load_persisted_session();
        mgr
    }

    fn storage_path() -> PathBuf {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".uocode-helper");
        let _ = fs::create_dir_all(&dir);
        dir.join("auth_session.json")
    }

    fn load_persisted_session(&mut self) {
        let path = Self::storage_path();
        if !path.exists() {
            return;
        }

        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(storage) = serde_json::from_str::<AuthSessionStorage>(&data) {
                self.current_user = storage.user;
                self.session_sid = storage.session_sid;
                self.selected_token_id = storage.selected_token_id;
                self.selected_token_name = storage.selected_token_name;

                // 若有 Refresh Cookie，注入到 CookieJar 中
                if let Some(cookie) = storage.refresh_cookie {
                    if let Ok(url) = Url::parse(&format!("{}/api/user/auth", BASE_URL)) {
                        self.cookie_jar.add_cookie_str(&cookie, &url);
                    }
                }
            }
        }
    }

    fn persist_session(&self, refresh_cookie: Option<&str>) {
        let path = Self::storage_path();
        let existing = if path.exists() {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str::<AuthSessionStorage>(&s).ok())
                .unwrap_or_default()
        } else {
            AuthSessionStorage::default()
        };

        let storage = AuthSessionStorage {
            user: self.current_user.clone(),
            refresh_cookie: refresh_cookie
                .map(|s| s.to_string())
                .or(existing.refresh_cookie),
            session_sid: self.session_sid.clone(),
            selected_token_id: self.selected_token_id,
            selected_token_name: self.selected_token_name.clone(),
        };

        if let Ok(json_str) = serde_json::to_string_pretty(&storage) {
            let _ = fs::write(&path, json_str);
        }
    }

    fn clear_persisted_session(&mut self) {
        self.access_token = None;
        self.access_expires_at = 0;
        self.current_user = None;
        self.session_sid = None;
        let path = Self::storage_path();
        let _ = fs::remove_file(path);
    }

    pub fn get_state(&self) -> CurrentAuthState {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let is_logged_in = self.current_user.is_some()
            && (self.access_token.is_some() || self.has_persisted_refresh_cookie());

        CurrentAuthState {
            is_logged_in,
            user: self.current_user.clone(),
            selected_token_id: self.selected_token_id,
            selected_token_name: self.selected_token_name.clone(),
            access_token_expires_at: if self.access_expires_at > now {
                Some(self.access_expires_at)
            } else {
                None
            },
        }
    }

    fn has_persisted_refresh_cookie(&self) -> bool {
        let path = Self::storage_path();
        if let Ok(data) = fs::read_to_string(path) {
            if let Ok(storage) = serde_json::from_str::<AuthSessionStorage>(&data) {
                return storage.refresh_cookie.is_some();
            }
        }
        false
    }

    pub fn set_selected_token(&mut self, token_id: Option<i64>, token_name: Option<String>) {
        self.selected_token_id = token_id;
        self.selected_token_name = token_name;
        self.persist_session(None);
    }
}

// ── 全局 AuthManager 单例 ──

static AUTH_MGR: once_cell::sync::Lazy<Mutex<AuthManager>> =
    once_cell::sync::Lazy::new(|| Mutex::new(AuthManager::new()));

pub(crate) async fn account_request(
    method: reqwest::Method,
    path: &str,
    body: Option<&serde_json::Value>,
    proof: Option<&str>,
    authenticated: bool,
) -> Result<serde_json::Value, String> {
    let token = if authenticated {
        Some(ensure_access_token().await?)
    } else {
        None
    };
    let client = { AUTH_MGR.lock().await.client.clone() };
    let mut request = client
        .request(method, format!("{BASE_URL}{path}"))
        .header(ORIGIN, AUTH_ORIGIN)
        .header(reqwest::header::ACCEPT, "application/json");
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if let Some(body) = body {
        request = request.json(body);
    }
    if let Some(proof) = proof {
        request = request.header("X-Security-Proof", proof);
    }
    // Proofs and OAuth codes are single-use: a failed write must never be replayed.
    let response = request
        .send()
        .await
        .map_err(|e| format!("账户请求失败: {}", e.without_url()))?;
    let status = response.status();
    let refresh = response
        .cookies()
        .find(|c| c.name() == "new_api_refresh")
        .map(|c| {
            format!(
                "new_api_refresh={}; Path=/api/user/auth; HttpOnly; Secure; SameSite=Strict",
                c.value()
            )
        });
    let text = response
        .text()
        .await
        .map_err(|_| "读取账户响应失败".to_string())?;
    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "账户操作")?;
    if !status.is_success() || !parsed.success {
        return Err(if parsed.message.is_empty() {
            format!("账户请求失败 (HTTP {status})")
        } else {
            parsed.message
        });
    }
    let data = parsed.data.unwrap_or(serde_json::Value::Null);
    if let Some(access) = data.get("access_token").and_then(|v| v.as_str()) {
        let mut mgr = AUTH_MGR.lock().await;
        mgr.access_token = Some(access.to_string());
        mgr.access_expires_at = data["access_expires_at"].as_i64().unwrap_or(0);
        if let Some(user) = data.get("user") {
            mgr.current_user =
                Some(serde_json::from_value(user.clone()).map_err(|_| "账户信息格式异常")?);
        }
        if let Some(sid) = data["session"]["sid"].as_str() {
            mgr.session_sid = Some(sid.to_string());
        }
        mgr.persist_session(refresh.as_deref());
    }
    Ok(data)
}

#[derive(Deserialize)]
pub struct RegisterPayload {
    username: String,
    password: String,
    email: Option<String>,
    verification_code: Option<String>,
    aff_code: Option<String>,
}

#[tauri::command]
pub async fn register_account(payload: RegisterPayload) -> Result<(), String> {
    let username = payload.username.trim();
    if username.is_empty()
        || username.chars().count() > 20
        || !(8..=128).contains(&payload.password.chars().count())
    {
        return Err("用户名为 1–20 字，密码为 8–128 字".into());
    }
    let status = get_site_status().await?;
    if status
        .extra
        .get("register_enabled")
        .and_then(|v| v.as_bool())
        == Some(false)
        || status
            .extra
            .get("password_register_enabled")
            .and_then(|v| v.as_bool())
            == Some(false)
        || status
            .extra
            .get("register_page_disabled")
            .and_then(|v| v.as_bool())
            == Some(true)
    {
        return Err("网站已关闭密码注册".into());
    }
    account_request(reqwest::Method::POST, "/api/user/register", Some(&serde_json::json!({"username":username,"password":payload.password,"email":payload.email,"verification_code":payload.verification_code,"aff_code":payload.aff_code})), None, false).await?;
    Ok(())
}

#[tauri::command]
pub async fn send_account_email(email: String, purpose: String) -> Result<(), String> {
    if email.len() > 254 || !email.contains('@') {
        return Err("请输入有效邮箱".into());
    }
    let path = match purpose.as_str() {
        "register" => "/api/verification",
        "reset" => "/api/reset_password",
        _ => return Err("验证码用途无效".into()),
    };
    let mut url = Url::parse(BASE_URL).unwrap();
    url.set_path(path);
    url.query_pairs_mut().append_pair("email", email.trim());
    let path = format!("{}?{}", url.path(), url.query().unwrap_or_default());
    account_request(reqwest::Method::GET, &path, None, None, false).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_security_overview() -> Result<serde_json::Value, String> {
    let user = read_account_data("/api/user/self", &[], "获取安全信息").await?["data"].clone();
    let twofa = read_account_data("/api/user/2fa/status", &[], "获取双因素状态").await;
    let sessions = read_account_data("/api/user/sessions", &[], "获取登录设备").await;
    Ok(
        serde_json::json!({ "user": user, "twofa":twofa.as_ref().ok().map(|v| &v["data"]), "sessions":sessions.as_ref().ok().map(|v| &v["data"]), "twofa_error":twofa.err(), "sessions_error":sessions.err() }),
    )
}

fn password_scope(scope: &str) -> Result<(), String> {
    if !["account.password.change", "account.password.set"].contains(&scope) {
        return Err("不支持的安全操作".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_password_verification(scope: String) -> Result<serde_json::Value, String> {
    password_scope(&scope)?;
    Ok(read_account_data(
        "/api/verify/methods",
        &[("scope".into(), scope)],
        "获取验证方式",
    )
    .await?["data"]
        .clone())
}

#[tauri::command]
pub async fn change_account_password(
    password: String,
    original_password: String,
    scope: String,
    verification: serde_json::Value,
) -> Result<serde_json::Value, String> {
    password_scope(&scope)?;
    if !(8..=128).contains(&password.chars().count()) {
        return Err("新密码长度为 8–128 字".into());
    }
    let proof = if let Some(proof) = verification["proof_token"].as_str() {
        proof.to_string()
    } else {
        let method = verification["method"].as_str().unwrap_or("");
        if !["password", "2fa", "session"].contains(&method) {
            return Err("请选择可用的身份验证方式".into());
        }
        let mut input = serde_json::json!({"scope":scope,"method":method});
        for key in [
            "password",
            "password_encrypted",
            "encryption_key_id",
            "code",
        ] {
            if let Some(value) = verification.get(key) {
                input[key] = value.clone();
            }
        }
        let result = account_request(
            reqwest::Method::POST,
            "/api/verify",
            Some(&input),
            None,
            true,
        )
        .await?;
        if result["scope"].as_str() != Some(scope.as_str())
            || result["expires_at"].as_i64().unwrap_or(0) <= chrono::Utc::now().timestamp()
        {
            return Err("安全验证已失效，请重新验证".into());
        }
        result["proof_token"]
            .as_str()
            .ok_or("未返回安全验证凭据")?
            .to_string()
    };
    let result = account_request(
        reqwest::Method::PUT,
        "/api/user/self",
        Some(&serde_json::json!({"password":password,"original_password":original_password})),
        Some(&proof),
        true,
    )
    .await?;
    Ok(
        serde_json::json!({"notification_warning":result["notification_warning"],"has_password":true}),
    )
}

#[tauri::command]
pub async fn revoke_account_sessions(sid: Option<String>) -> Result<(), String> {
    if let Some(sid) = sid {
        if sid.is_empty()
            || sid.len() > 128
            || !sid
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err("登录设备标识无效".into());
        }
        if AUTH_MGR.lock().await.session_sid.as_deref() == Some(&sid) {
            return Err("当前设备请使用退出登录".into());
        }
        account_request(
            reqwest::Method::DELETE,
            &format!("/api/user/sessions/{sid}"),
            None,
            None,
            true,
        )
        .await?;
    } else {
        account_request(
            reqwest::Method::POST,
            "/api/user/sessions/revoke-others",
            None,
            None,
            true,
        )
        .await?;
    }
    Ok(())
}

pub(crate) fn oauth_callback_query(
    url: &Url,
    provider: &str,
    state: &str,
) -> Option<Result<String, String>> {
    if url.origin().ascii_serialization() != BASE_URL || url.path() != format!("/oauth/{provider}")
    {
        return None;
    }
    let states: Vec<_> = url
        .query_pairs()
        .filter(|(key, _)| key == "state")
        .map(|(_, value)| value.into_owned())
        .collect();
    if states != [state] {
        return Some(Err("快捷登录状态校验失败，请重试".into()));
    }
    if url.query_pairs().any(|(key, _)| key == "error") {
        return Some(Err("授权未完成或已取消".into()));
    }
    if !url
        .query_pairs()
        .any(|(key, value)| key == "code" && !value.is_empty())
    {
        return Some(Err("授权回调缺少 code".into()));
    }
    Some(Ok(url.query().unwrap_or_default().to_string()))
}

#[tauri::command]
pub async fn oauth_authorize(
    app: tauri::AppHandle,
    provider: String,
    scope: Option<String>,
    compatibility: Option<bool>,
    locale: Option<String>,
) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    static ACTIVE: AtomicBool = AtomicBool::new(false);
    struct ActiveGuard;
    impl Drop for ActiveGuard {
        fn drop(&mut self) {
            ACTIVE.store(false, Ordering::Release);
        }
    }
    if ACTIVE.swap(true, Ordering::AcqRel) {
        return Err("请先完成或关闭已有授权窗口".into());
    }
    let _active_guard = ActiveGuard;
    if let Some(scope) = &scope {
        password_scope(scope)?;
    }
    if app.get_webview_window("uocode-oauth").is_some() {
        return Err("请先完成或关闭已有授权窗口".into());
    }
    let status = get_site_status().await?;
    let (flag, client_key, endpoint) = match provider.as_str() {
        "github" => (
            "github_oauth",
            "github_client_id",
            "https://github.com/login/oauth/authorize",
        ),
        "google" => (
            "google_oauth",
            "google_client_id",
            "https://accounts.google.com/o/oauth2/v2/auth",
        ),
        "discord" => (
            "discord_oauth",
            "discord_client_id",
            "https://discord.com/oauth2/authorize",
        ),
        "linuxdo" => (
            "linuxdo_oauth",
            "linuxdo_client_id",
            "https://connect.linux.do/oauth2/authorize",
        ),
        "oidc" => (
            "oidc_enabled",
            "oidc_client_id",
            status
                .extra
                .get("oidc_authorization_endpoint")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        ),
        _ => return Err("暂不支持此快捷登录提供商".into()),
    };
    if status.extra.get(flag).and_then(|v| v.as_bool()) != Some(true) {
        return Err("网站未开启此快捷登录方式".into());
    }
    let client_id = status
        .extra
        .get(client_key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or("网站未配置快捷登录 Client ID")?;
    let flow = account_request(reqwest::Method::POST, "/api/oauth/state", Some(&serde_json::json!({"provider":provider,"intent":if scope.is_some(){"verify"}else{"login"},"scope":scope})), None, scope.is_some()).await?;
    let state = flow
        .as_str()
        .or_else(|| flow["flow_token"].as_str())
        .ok_or("未返回授权状态")?
        .to_string();
    let mut url = Url::parse(endpoint).map_err(|_| "网站授权地址无效")?;
    if url.scheme() != "https" {
        return Err("网站授权地址必须使用 HTTPS".into());
    }
    {
        let mut params = url.query_pairs_mut();
        params
            .append_pair("client_id", client_id)
            .append_pair("state", &state);
        if provider == "github" {
            params.append_pair("scope", "user:email");
        } else {
            params.append_pair("response_type", "code");
            if provider != "linuxdo" {
                params.append_pair("redirect_uri", &format!("{BASE_URL}/oauth/{provider}"));
                params.append_pair(
                    "scope",
                    if provider == "discord" {
                        "identify openid"
                    } else {
                        "openid profile email"
                    },
                );
            }
        }
    }
    let query = if compatibility.unwrap_or(false) {
        crate::auth_browser::authorize(&app, &url, &provider, &state)
            .await?
            .ok_or("当前设备没有可用的兼容授权窗口")?
    } else {
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
        let sender = Arc::new(std::sync::Mutex::new(Some(tx)));
        let navigation_sender = sender.clone();
        let close_sender = sender.clone();
        let callback_provider = provider.clone();
        let mut builder = tauri::WebviewWindowBuilder::new(
            &app,
            "uocode-oauth",
            tauri::WebviewUrl::External(url),
        )
        .title(
            crate::native_locale::window_title(locale.as_deref(), "native.oauthTitle")
                .replace("{{provider}}", &provider),
        )
        .inner_size(520.0, 720.0)
        .min_inner_size(420.0, 540.0)
        .center()
        .on_navigation(move |url| {
            if let Some(result) = oauth_callback_query(url, &callback_provider, &state) {
                if let Ok(mut sender) = navigation_sender.lock() {
                    if let Some(tx) = sender.take() {
                        let _ = tx.send(result);
                    }
                }
                return false;
            }
            url.scheme() == "https" || url.as_str() == "about:blank"
        });
        if let Some(main) = app.get_webview_window("main") {
            builder = builder.parent(&main).map_err(|e| e.to_string())?;
        }
        let window = builder
            .build()
            .map_err(|e| format!("打开授权窗口失败: {e}"))?;
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut sender) = close_sender.lock() {
                    if let Some(tx) = sender.take() {
                        let _ = tx.send(Err("已取消快捷登录".into()));
                    }
                }
            }
        });
        let result = tokio::time::timeout(Duration::from_secs(300), rx).await;
        let _ = window.close();
        result
            .map_err(|_| "授权已超时，请重试")?
            .map_err(|_| "授权窗口已关闭")??
    };
    let data = account_request(
        reqwest::Method::GET,
        &format!("/api/oauth/{provider}?{query}"),
        None,
        None,
        scope.is_some(),
    )
    .await?;
    if scope.is_some() {
        return Ok(data);
    }
    if data["require_2fa"].as_bool() == Some(true)
        || data["require_verification"].as_bool() == Some(true)
    {
        return Ok(
            serde_json::json!({"type":"require_2fa","require_2fa":true,"flow_token":data["flow_token"],"expires_at":data["expires_at"]}),
        );
    }
    let success = parse_login_success_data(&data)?;
    serde_json::to_value(LoginResult::Success(success)).map_err(|_| "授权登录响应格式异常".into())
}

// ── 接口实现 ──

/// 获取站点基本状态（密码登录开关、验证码配置等）
pub async fn get_site_status() -> Result<SiteStatus, String> {
    // 只在复制客户端时持锁，发送网络请求前释放锁。
    let client = { AUTH_MGR.lock().await.client.clone() };

    let url = format!("{}/api/status", BASE_URL);
    let resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(ORIGIN, AUTH_ORIGIN)
        .send()
        .await
        .map_err(|e| format!("请求站点状态失败: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取站点状态响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "获取站点状态")?;

    let data = parsed
        .data
        .ok_or_else(|| "站点状态未包含 data 字段".to_string())?;

    Ok(SiteStatus {
        extra: data
            .as_object()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|(key, _)| {
                ![
                    "quota_display_type",
                    "custom_currency_symbol",
                    "password_login_enabled",
                    "password_login_encryption_enabled",
                    "captcha_enabled",
                    "captcha_type",
                    "slide_captcha_check",
                ]
                .contains(&key.as_str())
            })
            .collect(),
        quota_display_type: data
            .get("quota_display_type")
            .and_then(|v| v.as_str())
            .unwrap_or("USD")
            .to_string(),
        custom_currency_symbol: data
            .get("custom_currency_symbol")
            .and_then(|v| v.as_str())
            .map(str::to_owned),
        password_login_enabled: data
            .get("password_login_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        password_login_encryption_enabled: data
            .get("password_login_encryption_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        captcha_enabled: data
            .get("captcha_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        captcha_type: data
            .get("captcha_type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        slide_captcha_check: data
            .get("slide_captcha_check")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

/// 获取密码加密公钥
pub async fn get_encryption_key() -> Result<EncryptionKeyData, String> {
    let mgr = AUTH_MGR.lock().await;
    let url = format!("{}/api/user/login/encryption-key", BASE_URL);
    let resp = mgr
        .client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(ORIGIN, AUTH_ORIGIN)
        .send()
        .await
        .map_err(|e| format!("获取加密公钥失败: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取加密公钥响应失败: {e}"))?;

    let parsed: ApiResponse<EncryptionKeyData> =
        parse_api_response_body(status, &text, "获取加密公钥")?;

    if !parsed.success {
        return Err(format!("服务端拒绝提供加密公钥: {}", parsed.message));
    }

    parsed.data.ok_or_else(|| "返回公钥数据为空".to_string())
}

/// 获取 GO 滑块图片与挑战 ID
pub async fn generate_captcha() -> Result<CaptchaGenerateData, String> {
    let mgr = AUTH_MGR.lock().await;
    let url = format!("{}/api/captcha/generate", BASE_URL);
    let resp = mgr
        .client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(ORIGIN, AUTH_ORIGIN)
        .send()
        .await
        .map_err(|e| format!("获取滑块验证码失败: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取滑块响应内容失败: {e}"))?;

    let parsed: ApiResponse<CaptchaGenerateData> =
        parse_api_response_body(status, &text, "获取滑块验证码")?;

    if !parsed.success {
        return Err(format!("生成滑块失败: {}", parsed.message));
    }

    parsed.data.ok_or_else(|| "滑块挑战数据为空".to_string())
}

/// 提交滑块校验（成功后会将 new_api_slide_captcha 写入统一 CookieJar）
pub async fn verify_captcha(captcha_id: String, x: i32, y: i32) -> Result<(), String> {
    let mgr = AUTH_MGR.lock().await;
    let url = format!("{}/api/captcha/verify", BASE_URL);

    let body = serde_json::json!({
        "captcha_id": captcha_id,
        "x": x,
        "y": y,
    });

    let resp = mgr
        .client
        .post(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(ORIGIN, AUTH_ORIGIN)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("滑块校验网络请求失败: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取滑块校验结果失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "滑块校验")?;

    if !status.is_success() || !parsed.success {
        let msg = if parsed.message.is_empty() {
            "滑块验证未通过，请重试".to_string()
        } else {
            parsed.message
        };
        return Err(msg);
    }

    Ok(())
}

/// 提交账号密码登录
pub async fn login(payload: LoginPayload) -> Result<LoginResult, String> {
    let mut mgr = AUTH_MGR.lock().await;
    let url = format!("{}/api/user/login", BASE_URL);

    let mut body = serde_json::Map::new();
    body.insert("username".to_string(), serde_json::json!(payload.username));

    if let Some(enc_pwd) = payload.password_encrypted {
        body.insert("password_encrypted".to_string(), serde_json::json!(enc_pwd));
        if let Some(kid) = payload.encryption_key_id {
            body.insert("encryption_key_id".to_string(), serde_json::json!(kid));
        }
    } else if let Some(pwd) = payload.password {
        body.insert("password".to_string(), serde_json::json!(pwd));
    } else {
        return Err("必须提供密码或加密密码".to_string());
    }

    let resp = mgr
        .client
        .post(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(ORIGIN, AUTH_ORIGIN)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("登录请求异常: {e}"))?;

    let status = resp.status();

    // 提取可能的 Set-Cookie: new_api_refresh
    let mut extracted_refresh_cookie: Option<String> = None;
    for cookie in resp.cookies() {
        if cookie.name() == "new_api_refresh" {
            extracted_refresh_cookie = Some(format!(
                "new_api_refresh={}; Path=/api/user/auth; HttpOnly; Secure; SameSite=Strict",
                cookie.value()
            ));
            break;
        }
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取登录响应返回失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "账号登录")?;

    if !status.is_success() || !parsed.success {
        return Err(if parsed.message.is_empty() {
            format!("登录失败，状态码: {}", status)
        } else {
            parsed.message
        });
    }

    let data = parsed
        .data
        .ok_or_else(|| "登录响应中缺少 data 字段".to_string())?;

    // 检查是否需要 2FA
    if data
        .get("require_2fa")
        .or_else(|| data.get("require_verification"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let flow_token = data
            .get("flow_token")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let expires_at = data.get("expires_at").and_then(|v| v.as_i64()).unwrap_or(0);
        return Ok(LoginResult::Require2Fa(TwoFaRequirement {
            require_2fa: true,
            flow_token,
            expires_at,
        }));
    }

    // 完整登录成功
    let success_data = parse_login_success_data(&data)?;
    mgr.access_token = Some(success_data.access_token.clone());
    mgr.access_expires_at = success_data.access_expires_at;
    mgr.current_user = Some(success_data.user.clone());
    mgr.session_sid = success_data.session_sid.clone();
    mgr.persist_session(extracted_refresh_cookie.as_deref());

    Ok(LoginResult::Success(success_data))
}

/// 提交 2FA 动态码
pub async fn login_2fa(flow_token: String, code: String) -> Result<LoginSuccessData, String> {
    let mut mgr = AUTH_MGR.lock().await;
    let url = format!("{}/api/user/login/2fa", BASE_URL);

    let body = serde_json::json!({
        "flow_token": flow_token,
        "code": code.trim(),
    });

    let resp = mgr
        .client
        .post(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(ORIGIN, AUTH_ORIGIN)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("2FA 验证请求异常: {e}"))?;

    let mut extracted_refresh_cookie: Option<String> = None;
    for cookie in resp.cookies() {
        if cookie.name() == "new_api_refresh" {
            extracted_refresh_cookie = Some(format!(
                "new_api_refresh={}; Path=/api/user/auth; HttpOnly; Secure; SameSite=Strict",
                cookie.value()
            ));
            break;
        }
    }

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取 2FA 响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "2FA 验证")?;

    if !parsed.success {
        return Err(if parsed.message.is_empty() {
            "2FA 验证码错误".to_string()
        } else {
            parsed.message
        });
    }

    let data = parsed
        .data
        .ok_or_else(|| "2FA 成功但未返回数据".to_string())?;
    let success_data = parse_login_success_data(&data)?;

    mgr.access_token = Some(success_data.access_token.clone());
    mgr.access_expires_at = success_data.access_expires_at;
    mgr.current_user = Some(success_data.user.clone());
    mgr.session_sid = success_data.session_sid.clone();
    mgr.persist_session(extracted_refresh_cookie.as_deref());

    Ok(success_data)
}

fn parse_login_success_data(data: &serde_json::Value) -> Result<LoginSuccessData, String> {
    let access_token = data
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "未返回 access_token".to_string())?
        .to_string();

    let access_expires_at = data
        .get("access_expires_at")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let user_val = data
        .get("user")
        .ok_or_else(|| "未返回 user 字段".to_string())?;

    let user = UserInfo {
        id: user_val
            .get("id")
            .and_then(|v| v.as_i64())
            .unwrap_or_default(),
        username: user_val
            .get("username")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        display_name: user_val
            .get("display_name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    };

    let session_sid = data
        .get("session")
        .and_then(|v| v.get("sid"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(LoginSuccessData {
        user,
        access_token,
        access_expires_at,
        session_sid,
    })
}

/// 刷新当前登录凭据
pub async fn refresh_session() -> Result<LoginSuccessData, String> {
    let mut mgr = AUTH_MGR.lock().await;
    let url = format!("{}/api/user/auth/refresh", BASE_URL);

    let mut req = mgr
        .client
        .post(&url)
        .header(ORIGIN, AUTH_ORIGIN)
        .header(CONTENT_TYPE, "application/json");

    if let Some(sid) = &mgr.session_sid {
        req = req.header("X-Auth-Session", sid);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("刷新会话网络请求异常: {e}"))?;

    let status = resp.status();
    let mut extracted_refresh_cookie: Option<String> = None;
    for cookie in resp.cookies() {
        if cookie.name() == "new_api_refresh" {
            extracted_refresh_cookie = Some(format!(
                "new_api_refresh={}; Path=/api/user/auth; HttpOnly; Secure; SameSite=Strict",
                cookie.value()
            ));
            break;
        }
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取会话刷新响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "刷新会话")?;

    if !status.is_success() || !parsed.success {
        let msg = if parsed.message.is_empty() {
            "刷新凭据失效，请重新登录".to_string()
        } else {
            parsed.message
        };
        mgr.clear_persisted_session();
        return Err(msg);
    }

    let data = parsed
        .data
        .ok_or_else(|| "刷新成功但缺少 data 字段".to_string())?;

    let success_data = parse_login_success_data(&data)?;
    mgr.access_token = Some(success_data.access_token.clone());
    mgr.access_expires_at = success_data.access_expires_at;
    mgr.current_user = Some(success_data.user.clone());
    mgr.session_sid = success_data.session_sid.clone();
    mgr.persist_session(extracted_refresh_cookie.as_deref());

    Ok(success_data)
}

/// 确保拥有可用的 access_token
async fn ensure_access_token() -> Result<String, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // 先在只读锁下判断
    {
        let mgr = AUTH_MGR.lock().await;
        if let Some(token) = &mgr.access_token {
            if mgr.access_expires_at > now + 30 {
                return Ok(token.clone());
            }
        }
    }

    // 需要刷新
    let refreshed = refresh_session().await?;
    Ok(refreshed.access_token)
}

/// 退出登录
pub async fn logout() -> Result<(), String> {
    let mut mgr = AUTH_MGR.lock().await;
    let url = format!("{}/api/user/auth/logout", BASE_URL);

    let mut req = mgr.client.post(&url).header(ORIGIN, AUTH_ORIGIN);

    if let Some(token) = &mgr.access_token {
        req = req.header(AUTHORIZATION, format!("Bearer {}", token));
    }
    if let Some(sid) = &mgr.session_sid {
        req = req.header("X-Auth-Session", sid);
    }

    let _ = req.send().await;
    mgr.clear_persisted_session();
    Ok(())
}

/// 为内置站点窗口提供当前桌面登录态所需的刷新 Cookie。
/// 访问令牌不离开 Rust 认证层；网页端会用该 Cookie 按站点自己的流程刷新短期令牌。
#[allow(dead_code)]
pub async fn get_webview_auth_cookie() -> Result<String, String> {
    let _ = ensure_access_token().await?;
    let mgr = AUTH_MGR.lock().await;
    let url = Url::parse(&format!("{BASE_URL}/api/user/auth/refresh"))
        .map_err(|e| format!("解析认证地址失败: {e}"))?;
    let header = mgr
        .cookie_jar
        .cookies(&url)
        .ok_or_else(|| "桌面登录态中没有可用于钱包窗口的刷新 Cookie".to_string())?;
    let header = header
        .to_str()
        .map_err(|e| format!("读取登录 Cookie 失败: {e}"))?;
    header
        .split(';')
        .map(str::trim)
        .find_map(|part| part.strip_prefix("new_api_refresh="))
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "桌面登录态中没有 new_api_refresh Cookie".to_string())
}

/// 获取当前登录态
pub async fn get_auth_state() -> CurrentAuthState {
    let mgr = AUTH_MGR.lock().await;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // 如果 access_token 已经过期但有 refresh cookie，尝试在后台恢复一次
    if mgr.current_user.is_some() && (mgr.access_token.is_none() || mgr.access_expires_at <= now) {
        drop(mgr);
        let _ = refresh_session().await;
        let mgr = AUTH_MGR.lock().await;
        return mgr.get_state();
    }

    mgr.get_state()
}

/// 切换当前选中的 API Key 记录
pub async fn set_selected_token(token_id: Option<i64>, token_name: Option<String>) {
    let mut mgr = AUTH_MGR.lock().await;
    mgr.set_selected_token(token_id, token_name);
}

// ── 令牌管理接口（关键：获取用户在 bob-api 创建的 API Key 列表） ──

/// 获取用户在 https://www.uocode.com 创建的 API Key 列表
pub async fn get_user_tokens() -> Result<Vec<TokenItem>, String> {
    let token = ensure_access_token().await?;
    let mgr = AUTH_MGR.lock().await;

    // 优先调用 search 接口获取完整列表
    let url = format!("{}/api/token/search?keyword=&p=1&size=100", BASE_URL);
    let resp = mgr
        .client
        .get(&url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("获取 API Key 列表失败: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取 API Key 列表响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "获取 API Key 列表")?;

    if !parsed.success {
        let msg = if parsed.message.is_empty() {
            "获取令牌列表失败".to_string()
        } else {
            parsed.message
        };
        return Err(msg);
    }

    let data = parsed
        .data
        .ok_or_else(|| "响应数据中无 data 字段".to_string())?;

    // 兼容 data 为数组或 data.items 为数组
    let items_val = if let Some(items) = data.get("items") {
        items
    } else if data.is_array() {
        &data
    } else {
        return Ok(vec![]);
    };

    let items: Vec<TokenItem> = serde_json::from_value(items_val.clone())
        .map_err(|e| format!("反序列化令牌列表失败: {e}"))?;

    Ok(items)
}

/// 获取某个 Token 的真实明文 API Key (调用 POST /api/token/:id/key)
pub async fn get_token_key(token_id: i64) -> Result<String, String> {
    let token = ensure_access_token().await?;
    let mgr = AUTH_MGR.lock().await;

    let url = format!("{}/api/token/{}/key", BASE_URL, token_id);
    let resp = mgr
        .client
        .post(&url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("读取明文 API Key 失败: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取明文 API Key 响应失败: {e}"))?;

    let parsed: ApiResponse<ApiRawTokenKeyData> =
        parse_api_response_body(status, &text, "读取明文 API Key")?;

    if !parsed.success {
        return Err(if parsed.message.is_empty() {
            "无法读取该 API Key 的明文，可能已被禁用或删除".to_string()
        } else {
            parsed.message
        });
    }

    let key_data = parsed.data.ok_or_else(|| "返回数据为空".to_string())?;

    let mut key = key_data.key.trim().to_string();
    if !key.starts_with("sk-") {
        key = format!("sk-{}", key);
    }

    Ok(key)
}

/// 快速在 bob-api 创建一个新的普通令牌（可选指定分组）
pub async fn create_user_token(name: String, group: Option<String>) -> Result<TokenItem, String> {
    let token = ensure_access_token().await?;
    let mgr = AUTH_MGR.lock().await;

    let target_group = group.unwrap_or_default().trim().to_string();
    let url = format!("{}/api/token/", BASE_URL);
    let body = serde_json::json!({
        "name": name.trim(),
        "expired_time": -1,
        "remain_quota": 0,
        "unlimited_quota": true,
        "model_limits_enabled": false,
        "model_limits": "",
        "allow_ips": "",
        "group": target_group,
        "auto_groups": [],
        "cross_group_retry": false,
        "fallback_groups": []
    });

    let resp = mgr
        .client
        .post(&url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("创建新令牌网络异常: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取创建令牌响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "创建新令牌")?;

    if !parsed.success {
        return Err(if parsed.message.is_empty() {
            "创建令牌失败".to_string()
        } else {
            parsed.message
        });
    }

    drop(mgr);

    // 重新检索该名称的令牌
    let tokens = get_user_tokens().await?;
    tokens
        .into_iter()
        .find(|t| t.name == name)
        .ok_or_else(|| "令牌创建成功，但刷新列表时未找到刚创建的记录".to_string())
}

/// 更新已有 API Key 的所属分组 (调用 PUT /api/token/)
pub async fn update_user_token_group(
    token_id: i64,
    new_group: String,
) -> Result<TokenItem, String> {
    let clean_group = new_group.trim().to_string();
    if clean_group.is_empty() {
        return Err("分组名称不能为空".to_string());
    }

    let token = ensure_access_token().await?;
    let client = {
        let mgr = AUTH_MGR.lock().await;
        mgr.client.clone()
    };

    // 1. 尝试通过 GET /api/token/:id 获取完整原有 Token 信息，确保保留原参数
    let get_url = format!("{}/api/token/{}", BASE_URL, token_id);
    let mut put_body = None;

    if let Ok(resp) = client
        .get(&get_url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .send()
        .await
    {
        let status = resp.status();
        if let Ok(text) = resp.text().await {
            if let Ok(parsed) =
                parse_api_response_body::<serde_json::Value>(status, &text, "读取原令牌信息")
            {
                if parsed.success {
                    if let Some(mut data_obj) = parsed.data {
                        if data_obj.is_object() {
                            data_obj["group"] = serde_json::json!(clean_group);
                            put_body = Some(data_obj);
                        }
                    }
                }
            }
        }
    }

    // 2. 如果 GET /api/token/:id 未取到，回退从 get_user_tokens 检索原有基础信息
    let body = if let Some(b) = put_body {
        b
    } else {
        let tokens = get_user_tokens().await?;
        let orig = tokens
            .into_iter()
            .find(|t| t.id == token_id)
            .ok_or_else(|| format!("未找到 ID 为 {} 的 API Key", token_id))?;

        serde_json::json!({
            "id": orig.id,
            "name": orig.name,
            "expired_time": orig.expired_time,
            "remain_quota": orig.remain_quota,
            "unlimited_quota": orig.unlimited_quota,
            "model_limits_enabled": false,
            "model_limits": "",
            "allow_ips": "",
            "group": clean_group,
            "auto_groups": [],
            "cross_group_retry": false,
            "fallback_groups": []
        })
    };

    let put_url = format!("{}/api/token/", BASE_URL);
    let resp = client
        .put(&put_url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("更新令牌分组网络异常: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取更新令牌响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "更新令牌分组")?;

    if !parsed.success {
        return Err(if parsed.message.is_empty() {
            "更新分组失败，可能您的账号无权使用该分组".to_string()
        } else {
            parsed.message
        });
    }

    // 重新检索更新后的令牌列表并返回
    let tokens = get_user_tokens().await?;
    let updated = tokens
        .into_iter()
        .find(|t| t.id == token_id)
        .ok_or_else(|| "分组更新成功，但刷新列表时未找到该令牌".to_string())?;

    Ok(updated)
}

/// 一键将 API Key 批量写入指定的 Agent 配置文件中
pub async fn apply_api_key_to_agents(
    api_key: String,
    targets: Vec<String>,
) -> Result<HashMap<String, bool>, String> {
    if api_key.trim().is_empty()
        || targets.is_empty()
        || targets.iter().any(|t| {
            ![
                "codex",
                "chatgpt",
                "claude",
                "workbuddy",
                "accio",
                "acciowork",
            ]
            .contains(&t.as_str())
        })
    {
        return Err("请选择有效密钥与目标 Agent".into());
    }
    let default_url = crate::api_endpoints::resolve("").await?;
    let mut results = HashMap::new();

    for target in targets {
        match target.as_str() {
            "codex" | "chatgpt" => {
                // 读取当前已有配置
                let cur = crate::codex::get_codex_config().ok();
                let url = crate::api_endpoints::resolve(
                    cur.as_ref()
                        .map(|c| c.base_url.as_str())
                        .unwrap_or(&default_url),
                )
                .await?;
                let model = cur.as_ref().map(|c| c.model.clone());
                match crate::codex::set_codex_config(url, api_key.clone(), model) {
                    Ok(_) => {
                        results.insert("chatgpt".to_string(), true);
                    }
                    Err(e) => {
                        error!("应用 Key 到 Codex 失败: {e}");
                        results.insert("chatgpt".to_string(), false);
                    }
                }
            }
            "claude" => {
                let cur = crate::claude::get_claude_config().ok();
                let url = crate::api_endpoints::resolve(
                    cur.as_ref()
                        .map(|c| c.base_url.as_str())
                        .unwrap_or(&default_url),
                )
                .await?;
                let model = cur.as_ref().map(|c| c.model.clone());
                match crate::claude::set_claude_config(url, api_key.clone(), model) {
                    Ok(_) => {
                        results.insert("claude".to_string(), true);
                    }
                    Err(e) => {
                        error!("应用 Key 到 Claude 失败: {e}");
                        results.insert("claude".to_string(), false);
                    }
                }
            }
            "workbuddy" => {
                let cur = crate::workbuddy::get_workbuddy_config().ok();
                let url = crate::api_endpoints::resolve(
                    cur.as_ref()
                        .map(|c| c.base_url.as_str())
                        .unwrap_or(&default_url),
                )
                .await?;
                let model = cur
                    .as_ref()
                    .map(|c| c.model.clone())
                    .unwrap_or_else(|| "gpt-5.6-sol".to_string());
                let payload = crate::workbuddy::WorkbuddySavePayload {
                    url,
                    api_key: api_key.clone(),
                    model,
                    supports_tool_call: cur.as_ref().map(|c| c.supports_tool_call).unwrap_or(true),
                    supports_images: cur.as_ref().map(|c| c.supports_images).unwrap_or(true),
                    supports_reasoning: cur.as_ref().map(|c| c.supports_reasoning).unwrap_or(true),
                    only_reasoning: cur.as_ref().map(|c| c.only_reasoning).unwrap_or(false),
                    can_disable_thinking: cur
                        .as_ref()
                        .map(|c| c.can_disable_thinking)
                        .unwrap_or(false),
                    use_custom_protocol: cur
                        .as_ref()
                        .map(|c| c.use_custom_protocol)
                        .unwrap_or(false),
                    default_effort: cur
                        .as_ref()
                        .map(|c| c.default_effort.clone())
                        .filter(|s| !s.is_empty()),
                    supported_efforts: cur
                        .as_ref()
                        .map(|c| c.supported_efforts.clone())
                        .unwrap_or_default(),
                    max_input_tokens: cur.as_ref().and_then(|c| c.max_input_tokens),
                    max_output_tokens: cur.as_ref().and_then(|c| c.max_output_tokens),
                };
                match crate::workbuddy::set_workbuddy_config(payload) {
                    Ok(_) => {
                        results.insert("workbuddy".to_string(), true);
                    }
                    Err(e) => {
                        error!("应用 Key 到 WorkBuddy 失败: {e}");
                        results.insert("workbuddy".to_string(), false);
                    }
                }
            }
            "accio" | "acciowork" => {
                let cur = crate::accio::config::load_accio_config();
                let config = crate::accio::config::AccioConfig {
                    base_url: crate::api_endpoints::resolve(&cur.base_url).await?,
                    api_key: api_key.clone(),
                    model: cur.model,
                    bridge_port: cur.bridge_port,
                    official_gateway: cur.official_gateway,
                    fallback_official: cur.fallback_official,
                    prevent_official_leak: cur.prevent_official_leak,
                    auto_start_bridge: cur.auto_start_bridge,
                    cached_models: cur.cached_models,
                };
                match crate::accio::config::save_accio_config(&config) {
                    Ok(_) => {
                        results.insert("acciowork".to_string(), true);
                    }
                    Err(e) => {
                        error!("应用 Key 到 AccioWork 失败: {e}");
                        results.insert("acciowork".to_string(), false);
                    }
                }
            }
            _ => {}
        }
    }

    Ok(results)
}

/// 优先读取监控；未实现该能力的站点仅返回用户可用分组。
pub async fn get_channel_group_overview(
    hours: Option<u32>,
) -> Result<ChannelGroupOverviewResult, String> {
    let token = ensure_access_token().await?;
    let client = AUTH_MGR.lock().await.client.clone();
    fetch_channel_group_overview(
        &client,
        BASE_URL,
        &token,
        hours.unwrap_or(3),
        &GROUP_MONITOR_UNAVAILABLE,
    )
    .await
}

async fn fetch_channel_group_overview(
    client: &Client,
    base_url: &str,
    token: &str,
    hours: u32,
    monitor_unavailable: &AtomicBool,
) -> Result<ChannelGroupOverviewResult, String> {
    let resp = client
        .get(format!("{base_url}/api/status-board/status"))
        .query(&[("window", format!("{hours}h"))])
        .send()
        .await
        .map_err(|e| format!("请求状态大盘网络异常: {e}"))?;
    let status = resp.status();
    if matches!(
        status,
        reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::METHOD_NOT_ALLOWED
    ) {
        return fetch_legacy_channel_group_overview(
            client,
            base_url,
            token,
            hours,
            monitor_unavailable,
        )
        .await;
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取状态大盘响应失败: {e}"))?;
    let parsed: ApiResponse<Vec<StatusBoardGroup>> =
        parse_api_response_body(status, &text, "获取状态大盘")?;
    if !parsed.success {
        return Err(if parsed.message.is_empty() {
            "获取状态大盘失败".to_string()
        } else {
            parsed.message
        });
    }
    let window: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("状态大盘格式异常: {e}"))?;
    if window.get("default_window").and_then(|v| v.as_str()) != Some(&format!("{hours}h")) {
        return Err("状态大盘返回的统计窗口与请求不一致".to_string());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("读取系统时间失败: {e}"))?
        .as_secs() as i64;
    Ok(ChannelGroupOverviewResult {
        groups: parsed
            .data
            .ok_or_else(|| "状态大盘中无 data 字段".to_string())?
            .into_iter()
            .map(|group| group.into_overview(hours, now))
            .collect(),
        monitoring_available: true,
    })
}

#[derive(Debug, Deserialize)]
struct StatusBoardStats {
    success_count: i64,
    error_count: i64,
    total_count: i64,
    success_rate: f64,
    // UoCode 的 avg_use_time 与桌面概览均以秒计。
    avg_use_time: f64,
}

#[derive(Debug, Deserialize)]
struct StatusBoardBucket {
    index: i64,
    #[serde(flatten)]
    stats: StatusBoardStats,
}

#[derive(Debug, Deserialize)]
struct StatusBoardGroup {
    group: String,
    #[serde(flatten)]
    stats: StatusBoardStats,
    buckets: Vec<StatusBoardBucket>,
}

impl StatusBoardGroup {
    fn into_overview(self, hours: u32, now: i64) -> ChannelGroupOverview {
        let span = i64::from(hours) * 3600;
        let bucket_count = self.buckets.len().max(1) as i64;
        ChannelGroupOverview {
            group_name: self.group,
            success_rate: self.stats.success_rate,
            avg_response_time: self.stats.avg_use_time,
            has_successful_requests: self.stats.success_count > 0,
            total_requests: self.stats.total_count,
            failed_requests: self.stats.error_count,
            // 公开接口只给桶序号；与网页一样按查询时刻和窗口推算桶起点。
            trend_points: self
                .buckets
                .into_iter()
                .map(|bucket| ChannelTrendPoint {
                    timestamp: now - span + bucket.index * span / bucket_count,
                    success_rate: bucket.stats.success_rate,
                    avg_response_time: bucket.stats.avg_use_time,
                    has_data: bucket.stats.total_count > 0,
                    total_requests: bucket.stats.total_count,
                    failed_requests: bucket.stats.error_count,
                })
                .collect(),
        }
    }
}

async fn fetch_legacy_channel_group_overview(
    client: &Client,
    base_url: &str,
    token: &str,
    hours: u32,
    monitor_unavailable: &AtomicBool,
) -> Result<ChannelGroupOverviewResult, String> {
    if monitor_unavailable.load(Ordering::Relaxed) {
        return fetch_available_channel_groups(client, base_url, token).await;
    }

    let url = format!("{base_url}/api/channel/monitor/group-overview?hours={hours}");
    let resp = client
        .get(&url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("请求分组监控数据网络异常: {e}"))?;

    let status = resp.status();
    if matches!(
        status,
        reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::METHOD_NOT_ALLOWED
    ) {
        monitor_unavailable.store(true, Ordering::Relaxed);
        return fetch_available_channel_groups(client, base_url, token).await;
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取分组监控数据响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "获取分组监控数据")?;

    if !parsed.success {
        let msg = if parsed.message.is_empty() {
            "获取分组监控数据失败".to_string()
        } else {
            parsed.message
        };
        return Err(msg);
    }

    let data_val = parsed
        .data
        .ok_or_else(|| "分组监控数据中无 data 字段".to_string())?;

    let items: Vec<ChannelGroupOverview> =
        serde_json::from_value(data_val).map_err(|e| format!("反序列化分组监控列表失败: {e}"))?;

    Ok(ChannelGroupOverviewResult {
        groups: items,
        monitoring_available: true,
    })
}

async fn fetch_available_channel_groups(
    client: &Client,
    base_url: &str,
    token: &str,
) -> Result<ChannelGroupOverviewResult, String> {
    let mut resp = client
        .get(format!("{base_url}/api/user/self/groups"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("请求可用分组网络异常: {e}"))?;

    if matches!(
        resp.status(),
        reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::METHOD_NOT_ALLOWED
    ) {
        resp = client
            .get(format!("{base_url}/api/user/groups"))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("请求分组列表网络异常: {e}"))?;
    }

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取分组列表响应失败: {e}"))?;
    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "获取可用分组")?;
    if !parsed.success {
        return Err(if parsed.message.is_empty() {
            "获取可用分组失败".to_string()
        } else {
            parsed.message
        });
    }
    let data = parsed
        .data
        .ok_or_else(|| "分组列表中无 data 字段".to_string())?;
    let groups = data
        .as_object()
        .ok_or_else(|| "分组列表格式异常，预期为分组名称映射".to_string())?
        .keys()
        .filter(|name| !name.trim().is_empty())
        .map(|name| ChannelGroupOverview {
            group_name: name.clone(),
            ..Default::default()
        })
        .collect();

    Ok(ChannelGroupOverviewResult {
        groups,
        monitoring_available: false,
    })
}

/// 获取用户在 bob-api 的钱包与额度余额信息 (调用 GET /api/user/self)
pub async fn get_user_wallet() -> Result<UserWalletInfo, String> {
    let mut token = ensure_access_token().await?;
    let url = format!("{}/api/user/self", BASE_URL);

    let mut resp = {
        let mgr = AUTH_MGR.lock().await;
        mgr.client
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("获取账号额度网络异常: {e}"))?
    };

    // 若 access_token 在服务端已失效 (401)，自动刷新一次会话凭据重试
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        if let Ok(refreshed) = refresh_session().await {
            token = refreshed.access_token;
            let mgr = AUTH_MGR.lock().await;
            if let Ok(retry_resp) = mgr
                .client
                .get(&url)
                .header(AUTHORIZATION, format!("Bearer {}", token))
                .send()
                .await
            {
                resp = retry_resp;
            }
        }
    }

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取账号额度响应失败: {e}"))?;

    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "获取账号额度")?;

    if !parsed.success {
        let msg = if parsed.message.is_empty() {
            "获取账号额度失败".to_string()
        } else {
            parsed.message
        };
        return Err(msg);
    }

    let data = parsed
        .data
        .ok_or_else(|| "响应数据中缺少 data 字段".to_string())?;

    let quota = data.get("quota").and_then(|v| v.as_i64()).unwrap_or(0);
    let used_quota = data.get("used_quota").and_then(|v| v.as_i64()).unwrap_or(0);
    let request_count = data
        .get("request_count")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let group = data
        .get("group")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let quota_per_unit: i64 = 500000;
    let rmb_to_usd_rate: f64 = 1.0; // UoCode 账号额度按 1:1 显示。

    let quota_usd = quota as f64 / quota_per_unit as f64;
    let quota_cny = quota_usd / rmb_to_usd_rate;

    let used_quota_usd = used_quota as f64 / quota_per_unit as f64;
    let used_quota_cny = used_quota_usd / rmb_to_usd_rate;

    Ok(UserWalletInfo {
        quota,
        used_quota,
        quota_usd,
        quota_cny,
        used_quota_usd,
        used_quota_cny,
        request_count,
        group,
        quota_per_unit,
        rmb_to_usd_rate,
    })
}

// Renderer commands select fixed account endpoints; they never supply arbitrary URLs.
pub(crate) async fn read_account_data(
    path: &str,
    query: &[(String, String)],
    action: &str,
) -> Result<serde_json::Value, String> {
    let mut token = ensure_access_token().await?;
    let client = { AUTH_MGR.lock().await.client.clone() };
    for attempt in 0..2 {
        let response = client
            .get(format!("{BASE_URL}{path}"))
            .bearer_auth(&token)
            .query(query)
            .send()
            .await
            .map_err(|e| format!("{action}网络异常: {e}"))?;
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
            token = refresh_session().await?.access_token;
            continue;
        }
        let body = response
            .text()
            .await
            .map_err(|e| format!("读取{action}失败: {e}"))?;
        let parsed: ApiResponse<serde_json::Value> =
            parse_api_response_body(status, &body, action)?;
        if !parsed.success {
            return Err(if parsed.message.is_empty() {
                format!("{action}失败")
            } else {
                parsed.message
            });
        }
        // Pricing includes vendors and group ratios alongside data.
        return serde_json::from_str(&body).map_err(|e| format!("解析{action}失败: {e}"));
    }
    Err(format!("{action}登录状态已失效"))
}

#[tauri::command]
pub async fn get_pricing_catalog() -> Result<serde_json::Value, String> {
    let result = read_account_data("/api/pricing", &[], "获取模型价格").await?;
    if !result.get("data").is_some_and(serde_json::Value::is_array) {
        return Err("模型价格响应格式异常".into());
    }
    Ok(result)
}

#[derive(serde::Deserialize)]
pub struct UsageLogQuery {
    p: u32,
    page_size: u32,
    #[serde(rename = "type")]
    log_type: u8,
    start_timestamp: Option<i64>,
    end_timestamp: Option<i64>,
    model_name: Option<String>,
    token_name: Option<String>,
    group: Option<String>,
    request_id: Option<String>,
}

#[tauri::command]
pub async fn get_usage_logs(query: UsageLogQuery) -> Result<serde_json::Value, String> {
    if query.p == 0 || !(1..=100).contains(&query.page_size) || query.log_type > 7 {
        return Err("日志分页或类型参数无效".into());
    }
    if let (Some(start), Some(end)) = (query.start_timestamp, query.end_timestamp) {
        if start > end || start < 0 {
            return Err("日志时间范围无效".into());
        }
    }
    let mut params = vec![
        ("p".into(), query.p.to_string()),
        ("page_size".into(), query.page_size.to_string()),
        ("type".into(), query.log_type.to_string()),
    ];
    for (key, value) in [
        ("start_timestamp", query.start_timestamp),
        ("end_timestamp", query.end_timestamp),
    ] {
        if let Some(value) = value {
            params.push((key.into(), value.to_string()));
        }
    }
    for (key, value) in [
        ("model_name", query.model_name),
        ("token_name", query.token_name),
        ("group", query.group),
        ("request_id", query.request_id),
    ] {
        if let Some(value) = value.filter(|s| !s.trim().is_empty()) {
            if value.len() > 512 {
                return Err("日志筛选内容过长".into());
            }
            params.push((key.into(), value));
        }
    }
    let result = read_account_data("/api/log/self", &params, "获取使用日志").await?;
    result
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| "使用日志响应缺少 data".into())
}

#[derive(serde::Deserialize)]
pub struct WalletBillQuery {
    p: u32,
    page_size: u32,
    keyword: Option<String>,
}

#[tauri::command]
pub async fn get_wallet_bills(query: WalletBillQuery) -> Result<serde_json::Value, String> {
    if query.p == 0 || !(1..=100).contains(&query.page_size) {
        return Err("钱包账单分页参数无效".into());
    }
    let mut params = vec![
        ("p".into(), query.p.to_string()),
        ("page_size".into(), query.page_size.to_string()),
    ];
    if let Some(keyword) = query.keyword.filter(|value| !value.trim().is_empty()) {
        if keyword.len() > 128 {
            return Err("钱包账单搜索内容过长".into());
        }
        params.push(("keyword".into(), keyword));
    }
    let result = read_account_data("/api/user/topup/self", &params, "获取钱包账单").await?;
    result
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| "钱包账单响应缺少 data".into())
}

#[derive(serde::Deserialize)]
pub struct TicketListQuery {
    p: u32,
    page_size: u32,
    status: Option<String>,
    keyword: Option<String>,
}

fn validate_ticket_ref(ticket_ref: &str) -> Result<(), String> {
    if ticket_ref.is_empty()
        || ticket_ref.len() > 64
        || !ticket_ref.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err("工单编号格式无效".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_ticket_list(query: TicketListQuery) -> Result<serde_json::Value, String> {
    if query.p == 0 || !(1..=100).contains(&query.page_size) {
        return Err("工单分页参数无效".into());
    }
    let mut params = vec![
        ("p".into(), query.p.to_string()),
        ("page_size".into(), query.page_size.to_string()),
    ];
    for (key, value) in [("status", query.status), ("keyword", query.keyword)] {
        if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
            if value.len() > 128 {
                return Err("工单筛选内容过长".into());
            }
            params.push((key.into(), value));
        }
    }
    let result = read_account_data("/api/ticket/self", &params, "获取工单").await?;
    result
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| "工单列表响应缺少 data".into())
}

#[tauri::command]
pub async fn get_ticket_detail(ticket_ref: String) -> Result<serde_json::Value, String> {
    validate_ticket_ref(&ticket_ref)?;
    let result = read_account_data(
        &format!("/api/ticket/self/{ticket_ref}"),
        &[],
        "获取工单详情",
    )
    .await?;
    result
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| "工单详情响应缺少 data".into())
}

#[tauri::command]
pub async fn create_ticket(
    title: String,
    category: String,
    priority: String,
    content: String,
    images: Vec<String>,
) -> Result<serde_json::Value, String> {
    if images.len() > 6 {
        return Err("单个工单最多上传 6 张图片".into());
    }
    let payload = serde_json::json!({
        "title": title.trim(),
        "category": category,
        "priority": priority,
        "content": content.trim(),
        "images": images,
    });
    account_request(
        reqwest::Method::POST,
        "/api/ticket/self",
        Some(&payload),
        None,
        true,
    )
    .await
}

#[tauri::command]
pub async fn reply_ticket(
    ticket_ref: String,
    content: String,
    images: Vec<String>,
) -> Result<serde_json::Value, String> {
    validate_ticket_ref(&ticket_ref)?;
    if images.len() > 6 {
        return Err("单条回复最多上传 6 张图片".into());
    }
    let payload = serde_json::json!({ "content": content.trim(), "images": images });
    account_request(
        reqwest::Method::POST,
        &format!("/api/ticket/self/{ticket_ref}/reply"),
        Some(&payload),
        None,
        true,
    )
    .await
}

#[tauri::command]
pub async fn close_ticket(ticket_ref: String) -> Result<serde_json::Value, String> {
    validate_ticket_ref(&ticket_ref)?;
    account_request(
        reqwest::Method::PUT,
        &format!("/api/ticket/self/{ticket_ref}/close"),
        Some(&serde_json::json!({})),
        None,
        true,
    )
    .await
}

#[tauri::command]
pub async fn mark_ticket_read(ticket_ref: String) -> Result<serde_json::Value, String> {
    validate_ticket_ref(&ticket_ref)?;
    account_request(
        reqwest::Method::POST,
        &format!("/api/ticket/self/{ticket_ref}/read"),
        Some(&serde_json::json!({})),
        None,
        true,
    )
    .await
}

#[tauri::command]
pub async fn get_ticket_summary() -> Result<serde_json::Value, String> {
    let result = read_account_data("/api/ticket/self/summary", &[], "获取工单未读数").await?;
    result
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| "工单未读数响应缺少 data".into())
}

#[tauri::command]
pub async fn upload_ticket_image(image: String, filename: String) -> Result<String, String> {
    let image = image.trim();
    let filename = filename.trim();
    if image.len() > 7_000_000
        || !["data:image/png;", "data:image/jpeg;", "data:image/webp;", "data:image/gif;"]
            .iter()
            .any(|prefix| image.starts_with(prefix))
    {
        return Err("仅支持 PNG、JPEG、WebP、GIF 图片，且单张不超过 5MB".into());
    }
    if filename.is_empty() || filename.len() > 128 {
        return Err("图片文件名无效".into());
    }
    let result = account_request(
        reqwest::Method::POST,
        "/api/ticket/upload",
        Some(&serde_json::json!({ "image": image, "filename": filename })),
        None,
        true,
    )
    .await?;
    result
        .get("url")
        .and_then(serde_json::Value::as_str)
        .filter(|url| url.starts_with("https://") || url.starts_with("http://"))
        .map(str::to_owned)
        .ok_or_else(|| "图片上传响应中没有有效 URL".into())
}

async fn send_topup_request(
    path: &str,
    payload: serde_json::Value,
    action: &str,
) -> Result<serde_json::Value, String> {
    let token = ensure_access_token().await?;
    let url = format!("{}{path}", BASE_URL);
    let resp = {
        let mgr = AUTH_MGR.lock().await;
        mgr.client
            .post(url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("{action}网络异常: {e}"))?
    };
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取{action}响应失败: {e}"))?;
    let envelope: serde_json::Value =
        serde_json::from_str(text.trim()).map_err(|e| format!("解析{action}响应失败: {e}"))?;
    let success = envelope
        .get("success")
        .and_then(serde_json::Value::as_bool)
        .or_else(|| {
            envelope
                .get("message")
                .and_then(serde_json::Value::as_str)
                .map(|value| value.eq_ignore_ascii_case("success"))
        })
        .unwrap_or(false);
    if !status.is_success() || !success {
        let message = envelope
            .get("message")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty() && *value != "error" && *value != "success")
            .or_else(|| envelope.get("data").and_then(serde_json::Value::as_str))
            .unwrap_or("充值请求失败");
        return Err(format!("{message} (HTTP {})", status.as_u16()));
    }
    Ok(envelope)
}

#[tauri::command]
pub async fn get_topup_info() -> Result<serde_json::Value, String> {
    let token = ensure_access_token().await?;
    let url = format!("{BASE_URL}/api/user/topup/info");
    let resp = {
        let mgr = AUTH_MGR.lock().await;
        mgr.client
            .get(url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| format!("获取充值配置网络异常: {e}"))?
    };
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取充值配置响应失败: {e}"))?;
    let parsed: ApiResponse<serde_json::Value> =
        parse_api_response_body(status, &text, "获取充值配置")?;
    if !parsed.success {
        return Err(if parsed.message.is_empty() {
            "获取充值配置失败".to_string()
        } else {
            parsed.message
        });
    }
    parsed
        .data
        .ok_or_else(|| "充值配置响应缺少 data".to_string())
}

#[tauri::command]
pub async fn request_topup_payment(
    amount: i64,
    payment_method: String,
    pay_method_index: Option<usize>,
    product_id: Option<String>,
) -> Result<serde_json::Value, String> {
    if amount <= 0 || payment_method.trim().is_empty() {
        return Err("充值金额和支付方式不能为空".to_string());
    }
    let method = payment_method.trim().to_lowercase();
    let (path, payload) = match method.as_str() {
        "stripe" => (
            "/api/user/stripe/pay",
            serde_json::json!({ "amount": amount, "payment_method": method }),
        ),
        "waffo" => (
            "/api/user/waffo/pay",
            serde_json::json!({ "amount": amount, "pay_method_index": pay_method_index }),
        ),
        "waffo_pancake" => (
            "/api/user/waffo-pancake/pay",
            serde_json::json!({ "amount": amount }),
        ),
        "creem" => (
            "/api/user/creem/pay",
            serde_json::json!({ "product_id": product_id.filter(|id| !id.trim().is_empty())
                .ok_or_else(|| "请选择充值产品".to_string())?, "payment_method": "creem" }),
        ),
        _ => (
            "/api/user/pay",
            serde_json::json!({ "amount": amount, "payment_method": method }),
        ),
    };
    send_topup_request(path, payload, "发起充值").await
}

#[tauri::command]
pub async fn calculate_topup_amount(
    amount: i64,
    payment_method: String,
) -> Result<serde_json::Value, String> {
    if amount <= 0 || payment_method.trim().is_empty() {
        return Err("充值金额和支付方式不能为空".to_string());
    }
    let path = match payment_method.as_str() {
        "stripe" => "/api/user/stripe/amount",
        "waffo" => "/api/user/waffo/amount",
        "waffo_pancake" => "/api/user/waffo-pancake/amount",
        _ => "/api/user/amount",
    };
    let response = send_topup_request(
        path,
        serde_json::json!({ "amount": amount, "payment_method": payment_method }),
        "计算应付金额",
    )
    .await?;
    response
        .get("data")
        .cloned()
        .ok_or_else(|| "应付金额响应缺少 data".to_string())
}

#[tauri::command]
pub async fn open_payment_form(
    app: tauri::AppHandle,
    url: String,
    fields: HashMap<String, String>,
    locale: Option<String>,
) -> Result<(), String> {
    let parsed_url = Url::parse(url.trim()).map_err(|e| format!("支付地址无效: {e}"))?;
    if !matches!(parsed_url.scheme(), "https" | "http") {
        return Err("支付地址协议不受支持".to_string());
    }
    if fields.is_empty() {
        return Err("支付参数为空".to_string());
    }

    let fields = serde_json::to_string(&fields).map_err(|_| "支付参数格式错误")?;
    open_payment_window_inner(
        &app,
        tauri::WebviewUrl::External("about:blank".parse().unwrap()),
        Some((parsed_url, fields)),
        locale.as_deref(),
    )
}

#[tauri::command]
pub async fn open_payment_window(
    app: tauri::AppHandle,
    url: String,
    locale: Option<String>,
) -> Result<(), String> {
    let parsed_url = Url::parse(url.trim()).map_err(|e| format!("支付地址无效: {e}"))?;
    if !matches!(parsed_url.scheme(), "https" | "http") {
        return Err("支付地址协议不受支持".to_string());
    }
    open_payment_window_inner(
        &app,
        tauri::WebviewUrl::External(parsed_url),
        None,
        locale.as_deref(),
    )
}

fn open_payment_window_inner(
    app: &tauri::AppHandle,
    initial_url: tauri::WebviewUrl,
    form: Option<(Url, String)>,
    locale: Option<&str>,
) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    if let Some(existing) = app.get_webview_window("uocode-payment") {
        let _ = existing.show();
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(());
    }
    let app_handle = app.clone();
    let mut builder = tauri::WebviewWindowBuilder::new(app, "uocode-payment", initial_url)
        .title(crate::native_locale::window_title(locale, "native.paymentTitle"))
        .inner_size(980.0, 760.0)
        .min_inner_size(720.0, 560.0)
        .center()
        .on_navigation(move |next| {
            let is_return = next.scheme() == "https"
                && matches!(next.host_str(), Some("www.uocode.com" | "uocode.com"))
                && matches!(next.path(), "/wallet" | "/usage-logs" | "/api/user/epay/return");
            if is_return {
                let _ = app_handle.emit("wallet-refresh", ());
                if let Some(window) = app_handle.get_webview_window("uocode-payment") {
                    let _ = window.close();
                }
                return false;
            }
            matches!(next.scheme(), "https" | "http" | "about")
        });
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }
    let window = builder.build().map_err(|e| format!("打开支付窗口失败: {e}"))?;
    if let Some((action, fields)) = form {
        let action = serde_json::to_string(action.as_str()).map_err(|_| "支付地址格式错误")?;
        let script = format!(
            "document.body.innerHTML='<p style=\\\"font:14px sans-serif;padding:24px\\\">正在跳转支付…</p>';const f=document.createElement('form');f.method='post';f.action={action};for(const [k,v] of Object.entries({fields})){{const i=document.createElement('input');i.type='hidden';i.name=k;i.value=String(v);f.appendChild(i)}}document.body.appendChild(f);f.submit();",
        );
        window.eval(script).map_err(|e| format!("加载支付表单失败: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod group_monitor_tests {
    use super::*;

    #[test]
    fn desktop_user_agent_matches_target_os() {
        assert!(desktop_user_agent()
            .starts_with(concat!(env!("AI_HELPER_BRAND_USER_AGENT_NAME"), "/")));
        assert!(desktop_user_agent().contains(env!("CARGO_PKG_VERSION")));
        #[cfg(target_os = "macos")]
        assert!(desktop_user_agent().ends_with("(macOS)"));

        #[cfg(target_os = "windows")]
        assert!(desktop_user_agent().ends_with("(Windows)"));
    }

    #[test]
    fn oauth_callback_requires_origin_provider_state_and_code() {
        let callback =
            |url: &str| oauth_callback_query(&Url::parse(url).unwrap(), "github", "expected-state");
        assert_eq!(
            callback("https://www.uocode.com/oauth/github?code=fixture-code&state=expected-state"),
            Some(Ok("code=fixture-code&state=expected-state".into()))
        );
        assert!(
            callback("https://www.uocode.com/oauth/github?code=fixture-code&state=wrong")
                .unwrap()
                .is_err()
        );
        assert!(callback("https://www.uocode.com/oauth/github?state=expected-state&state=wrong&code=fixture-code").unwrap().is_err());
        assert!(
            callback("https://www.uocode.com/oauth/github?state=expected-state")
                .unwrap()
                .is_err()
        );
        assert!(callback(
            "https://www.uocode.com/oauth/github?state=expected-state&error=access_denied"
        )
        .unwrap()
        .is_err());
        assert!(callback(
            "https://www.uocode.com/oauth/google?state=expected-state&code=fixture-code"
        )
        .is_none());
        assert!(callback("https://www.uocode.com.example.test/oauth/github?state=expected-state&code=fixture-code").is_none());
        assert!(callback(
            "http://www.uocode.com/oauth/github?state=expected-state&code=fixture-code"
        )
        .is_none());
        assert!(callback(
            "https://www.uocode.com:8443/oauth/github?state=expected-state&code=fixture-code"
        )
        .is_none());
        assert!(password_scope("account.password.change").is_ok());
        assert!(password_scope("account.password.set").is_ok());
        assert!(password_scope("account.delete").is_err());
    }
    use axum::{routing::get, Json, Router};
    use std::sync::atomic::AtomicUsize;

    struct MockServer {
        base_url: String,
        monitor_hits: Arc<AtomicUsize>,
        group_hits: Arc<AtomicUsize>,
        public_hits: Arc<AtomicUsize>,
        task: tokio::task::JoinHandle<()>,
    }

    impl Drop for MockServer {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    async fn server(
        monitor_status: reqwest::StatusCode,
        group_status: reqwest::StatusCode,
    ) -> MockServer {
        server_with_status_board(
            monitor_status,
            group_status,
            reqwest::StatusCode::NOT_FOUND,
            serde_json::json!({}),
        )
        .await
    }

    async fn server_with_status_board(
        monitor_status: reqwest::StatusCode,
        group_status: reqwest::StatusCode,
        board_status: reqwest::StatusCode,
        board_data: serde_json::Value,
    ) -> MockServer {
        let monitor_hits = Arc::new(AtomicUsize::new(0));
        let group_hits = Arc::new(AtomicUsize::new(0));
        let public_hits = Arc::new(AtomicUsize::new(0));
        let monitor_count = monitor_hits.clone();
        let group_count = group_hits.clone();
        let public_count = public_hits.clone();
        let app = Router::new()
            .route(
                "/api/status-board/status",
                get(
                    move |axum::extract::Query(query): axum::extract::Query<
                        HashMap<String, String>,
                    >| {
                        let mut data = board_data.clone();
                        async move {
                            if data.get("default_window").is_none() {
                                data["default_window"] = serde_json::json!(query.get("window"));
                            }
                            (board_status, Json(data))
                        }
                    },
                ),
            )
            .route(
                "/api/channel/monitor/group-overview",
                get(move || {
                    let count = monitor_count.clone();
                    async move {
                        count.fetch_add(1, Ordering::Relaxed);
                        (
                            monitor_status,
                            Json(serde_json::json!({
                                "success": true,
                                "data": [{"group_name": "Codex-Pro", "success_rate": 99.5}]
                            })),
                        )
                    }
                }),
            )
            .route(
                "/api/user/self/groups",
                get(move || {
                    let count = group_count.clone();
                    async move {
                        count.fetch_add(1, Ordering::Relaxed);
                        (
                            group_status,
                            Json(serde_json::json!({
                                "success": true,
                                "data": {"Codex-Pro": {"ratio": 1}, "default": {"ratio": 2}}
                            })),
                        )
                    }
                }),
            )
            .route(
                "/api/user/groups",
                get(move || {
                    let count = public_count.clone();
                    async move {
                        count.fetch_add(1, Ordering::Relaxed);
                        Json(
                            serde_json::json!({"success": true, "data": {"default": {"ratio": 2}}}),
                        )
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        MockServer {
            base_url,
            monitor_hits,
            group_hits,
            public_hits,
            task,
        }
    }

    fn client() -> Client {
        Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
    }

    fn board_data() -> serde_json::Value {
        // 精简自 UoCode 公开状态接口：avg_use_time 为秒，空桶可能返回 100%。
        serde_json::json!({"success": true, "data": [{
            "group": "GPT Codex", "success_count": 67, "error_count": 6,
            "total_count": 73, "success_rate": 91.78082191780823,
            "avg_use_time": 55.42465753424658,
            "buckets": [
                {"index": 0, "success_count": 0, "error_count": 0,
                 "total_count": 0, "success_rate": 100, "avg_use_time": 0},
                {"index": 1, "success_count": 1, "error_count": 2,
                 "total_count": 3, "success_rate": 33.33333333333333,
                 "avg_use_time": 90.66666666666667}
            ]
        }]})
    }

    #[tokio::test]
    async fn status_board_adapts_counts_seconds_and_window() {
        let server = server_with_status_board(
            reqwest::StatusCode::NOT_FOUND,
            reqwest::StatusCode::OK,
            reqwest::StatusCode::OK,
            board_data(),
        )
        .await;
        for hours in [3, 12, 24] {
            let result = fetch_channel_group_overview(
                &client(),
                &server.base_url,
                "test-token",
                hours,
                &AtomicBool::new(true),
            )
            .await
            .unwrap();
            assert!(result.monitoring_available);
            let group = &result.groups[0];
            assert_eq!(group.group_name, "GPT Codex");
            assert_eq!(group.total_requests, 73);
            assert_eq!(group.failed_requests, 6);
            assert!(group.has_successful_requests);
            assert!((group.avg_response_time - 55.42465753424658).abs() < 0.00001);
            assert!(!group.trend_points[0].has_data);
            assert!(group.trend_points[1].has_data);
            assert_eq!(group.trend_points[1].failed_requests, 2);
            assert_eq!(
                group.trend_points[1].timestamp - group.trend_points[0].timestamp,
                i64::from(hours) * 1800
            );
        }
        assert_eq!(server.monitor_hits.load(Ordering::Relaxed), 0);
        assert_eq!(server.group_hits.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn status_board_errors_do_not_fall_back() {
        for status in [
            reqwest::StatusCode::UNAUTHORIZED,
            reqwest::StatusCode::FORBIDDEN,
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
        ] {
            let server = server_with_status_board(
                reqwest::StatusCode::OK,
                reqwest::StatusCode::OK,
                status,
                board_data(),
            )
            .await;
            assert!(fetch_channel_group_overview(
                &client(),
                &server.base_url,
                "test-token",
                3,
                &AtomicBool::new(false),
            )
            .await
            .is_err());
            assert_eq!(server.monitor_hits.load(Ordering::Relaxed), 0);
        }
    }

    #[tokio::test]
    async fn status_board_rejects_mismatched_window_and_malformed_data() {
        let mut mismatched = board_data();
        mismatched["default_window"] = serde_json::json!("24h");
        for data in [
            mismatched,
            serde_json::json!({"success": true, "data": [{}]}),
            serde_json::json!({"success": false, "message": "monitor disabled"}),
        ] {
            let server = server_with_status_board(
                reqwest::StatusCode::OK,
                reqwest::StatusCode::OK,
                reqwest::StatusCode::OK,
                data,
            )
            .await;
            assert!(fetch_channel_group_overview(
                &client(),
                &server.base_url,
                "test-token",
                3,
                &AtomicBool::new(false),
            )
            .await
            .is_err());
            assert_eq!(server.monitor_hits.load(Ordering::Relaxed), 0);
        }
    }

    #[tokio::test]
    #[ignore = "requires live UoCode network access"]
    async fn status_board_live() {
        for hours in [3, 12, 24] {
            let result = fetch_channel_group_overview(
                &client(),
                BASE_URL,
                "",
                hours,
                &AtomicBool::new(false),
            )
            .await
            .unwrap();
            assert!(result.monitoring_available);
            assert!(!result.groups.is_empty());
            assert!(result
                .groups
                .iter()
                .all(|group| !group.trend_points.is_empty()));
        }
    }

    #[tokio::test]
    async fn missing_monitor_uses_groups_and_caches_capability() {
        for status in [
            reqwest::StatusCode::NOT_FOUND,
            reqwest::StatusCode::METHOD_NOT_ALLOWED,
        ] {
            let server = server(status, reqwest::StatusCode::OK).await;
            let unavailable = AtomicBool::new(false);
            let client = client();
            for hours in [1, 3] {
                let result = fetch_channel_group_overview(
                    &client,
                    &server.base_url,
                    "test-token",
                    hours,
                    &unavailable,
                )
                .await
                .unwrap();
                assert!(!result.monitoring_available);
                assert_eq!(result.groups.len(), 2);
                assert!(result.groups.iter().any(|g| g.group_name == "Codex-Pro"));
                assert!(result.groups.iter().all(|g| g.trend_points.is_empty()));
            }
            assert_eq!(server.monitor_hits.load(Ordering::Relaxed), 1);
            assert_eq!(server.group_hits.load(Ordering::Relaxed), 2);
            assert_eq!(server.public_hits.load(Ordering::Relaxed), 0);
        }
    }

    #[tokio::test]
    async fn auth_and_server_errors_are_not_hidden() {
        for status in [
            reqwest::StatusCode::UNAUTHORIZED,
            reqwest::StatusCode::FORBIDDEN,
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
        ] {
            let server = server(status, reqwest::StatusCode::OK).await;
            let unavailable = AtomicBool::new(false);
            assert!(fetch_channel_group_overview(
                &client(),
                &server.base_url,
                "test-token",
                1,
                &unavailable
            )
            .await
            .is_err());
            assert!(!unavailable.load(Ordering::Relaxed));
            assert_eq!(server.group_hits.load(Ordering::Relaxed), 0);
        }
        let server = server(
            reqwest::StatusCode::NOT_FOUND,
            reqwest::StatusCode::UNAUTHORIZED,
        )
        .await;
        assert!(fetch_channel_group_overview(
            &client(),
            &server.base_url,
            "test-token",
            1,
            &AtomicBool::new(false)
        )
        .await
        .is_err());
        assert_eq!(server.public_hits.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn native_monitor_data_remains_available() {
        let server = server(reqwest::StatusCode::OK, reqwest::StatusCode::OK).await;
        let result = fetch_channel_group_overview(
            &client(),
            &server.base_url,
            "test-token",
            1,
            &AtomicBool::new(false),
        )
        .await
        .unwrap();
        assert!(result.monitoring_available);
        assert_eq!(result.groups[0].success_rate, 99.5);
        assert_eq!(server.group_hits.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn missing_self_groups_uses_public_group_list() {
        let server = server(
            reqwest::StatusCode::NOT_FOUND,
            reqwest::StatusCode::NOT_FOUND,
        )
        .await;
        let result = fetch_channel_group_overview(
            &client(),
            &server.base_url,
            "test-token",
            1,
            &AtomicBool::new(false),
        )
        .await
        .unwrap();
        assert!(!result.monitoring_available);
        assert_eq!(result.groups[0].group_name, "default");
        assert_eq!(server.public_hits.load(Ordering::Relaxed), 1);
    }
}
