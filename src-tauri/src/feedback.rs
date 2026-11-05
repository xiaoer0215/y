use reqwest::Url;
use serde_json::json;
use std::collections::HashSet;
use std::time::Duration;

fn is_meaningful(value: &str, minimum: usize, maximum: usize) -> bool {
    let chars: Vec<char> = value.trim().chars().collect();
    if chars.len() < minimum || chars.len() > maximum {
        return false;
    }
    let unique = chars.iter().collect::<HashSet<_>>();
    let mut run = 1usize;
    let mut longest_run = 1usize;
    for pair in chars.windows(2) {
        run = if pair[0] == pair[1] { run + 1 } else { 1 };
        longest_run = longest_run.max(run);
    }
    unique.len() > 1 && longest_run < 6
}

fn validate_webhook(value: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|_| "invalidWebhook".to_string())?;
    let allowed_host = matches!(
        url.host_str(),
        Some("open.feishu.cn" | "open.larksuite.com")
    );
    if url.scheme() != "https"
        || !allowed_host
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || !url
            .path()
            .strip_prefix("/open-apis/bot/v2/hook/")
            .is_some_and(|token| {
                !token.is_empty()
                    && token
                        .bytes()
                        .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-' || ch == b'_')
            })
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("invalidWebhook".into());
    }
    Ok(url)
}

fn check_response(result: &serde_json::Value) -> Result<(), String> {
    match result
        .get("code")
        .or_else(|| result.get("StatusCode"))
        .and_then(serde_json::Value::as_i64)
    {
        Some(0) => Ok(()),
        Some(_) => Err("rejected".into()),
        None => Err("response".into()),
    }
}

#[tauri::command]
pub async fn send_feishu_feedback(
    webhook: String,
    title: String,
    details: String,
    contact: Option<String>,
    app_version: String,
) -> Result<(), String> {
    let webhook = validate_webhook(&webhook)?;
    let title = title.trim();
    let details = details.trim();
    let contact = contact.unwrap_or_default();
    let contact = contact.trim();

    if !is_meaningful(title, 5, 120) {
        return Err("invalidTitle".into());
    }
    if !is_meaningful(details, 15, 5000) {
        return Err("invalidDetails".into());
    }
    if contact.chars().count() > 200 {
        return Err("invalidContact".into());
    }

    let mut message = format!(
        "{} feedback\nSubject: {title}\nVersion: {}\n\n{}",
        env!("AI_HELPER_BRAND_NAME"),
        app_version.trim(),
        details
    );
    if !contact.is_empty() {
        message.push_str(&format!("\n\nContact: {contact}"));
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .proxy(reqwest::Proxy::custom(|_| {
            crate::updater::get_cached_upstream_proxy_url()
        }))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "network".to_string())?;
    let response = client
        .post(webhook)
        .json(&json!({ "msg_type": "text", "content": { "text": message } }))
        .send()
        .await
        .map_err(|_| "network".to_string())?;

    if !response.status().is_success() {
        return Err("rejected".into());
    }
    let result: serde_json::Value = response.json().await.map_err(|_| "response".to_string())?;
    check_response(&result)
}

#[cfg(test)]
mod tests {
    use super::{check_response, is_meaningful, validate_webhook};
    use serde_json::json;

    #[test]
    fn accepts_only_feishu_custom_bot_webhooks() {
        assert!(
            validate_webhook("https://open.feishu.cn/open-apis/bot/v2/hook/example-token").is_ok()
        );
        assert!(
            validate_webhook("https://open.larksuite.com/open-apis/bot/v2/hook/example-token")
                .is_ok()
        );
        assert!(validate_webhook("http://open.feishu.cn/open-apis/bot/v2/hook/token").is_err());
        assert!(validate_webhook("https://example.com/open-apis/bot/v2/hook/token").is_err());
        assert!(validate_webhook("https://open.feishu.cn/anything").is_err());
        assert!(validate_webhook("https://open.feishu.cn/open-apis/bot/v2/hook/").is_err());
        assert!(
            validate_webhook("https://open.feishu.cn/open-apis/bot/v2/hook/token?key=x").is_err()
        );
        assert!(
            validate_webhook("https://user@open.feishu.cn/open-apis/bot/v2/hook/token").is_err()
        );
        assert!(
            validate_webhook("https://open.feishu.cn:8443/open-apis/bot/v2/hook/token").is_err()
        );
    }

    #[test]
    fn requires_explicit_bot_success() {
        assert!(check_response(&json!({"code": 0})).is_ok());
        assert!(check_response(&json!({"StatusCode": 0})).is_ok());
        assert!(check_response(&json!({"code": 19024})).is_err());
        assert!(check_response(&json!({})).is_err());
    }

    #[test]
    fn rejects_short_and_repeated_feedback() {
        assert!(!is_meaningful("问题", 5, 120));
        assert!(!is_meaningful("AAAAAAAAAAAAA", 5, 120));
        assert!(!is_meaningful("这是一个正常问题", 15, 5000));
        assert!(is_meaningful("登录后工作台一直显示连接超时错误", 15, 5000));
    }
}
