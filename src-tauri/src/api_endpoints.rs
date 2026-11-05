use once_cell::sync::Lazy;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

static CACHE: Lazy<Mutex<Option<(Instant, Vec<String>)>>> = Lazy::new(|| Mutex::new(None));

fn normalize(raw: &str) -> Option<String> {
    let url = reqwest::Url::parse(raw.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
        || matches!(url.host_str(), Some("www.uocode.com" | "uocode.com"))
    {
        return None;
    }
    Some(url.to_string().trim_end_matches('/').to_owned())
}

fn parse(value: &Value) -> Vec<String> {
    let decoded;
    let value = if let Some(text) = value.as_str() {
        decoded = serde_json::from_str::<Value>(text).unwrap_or(Value::Null);
        &decoded
    } else {
        value
    };
    let mut endpoints = Vec::new();
    if let Some(items) = value.as_array() {
        for item in items {
            if let Some(url) = item
                .as_str()
                .or_else(|| item.get("url").and_then(Value::as_str))
                .and_then(normalize)
            {
                if !endpoints.contains(&url) {
                    endpoints.push(url);
                }
            }
            if endpoints.len() == 2 {
                break;
            }
        }
    }
    endpoints
}

fn matches(a: &str, b: &str) -> bool {
    let root = |s: &str| s.trim_end_matches('/').trim_end_matches("/v1").to_owned();
    root(a) == root(b)
}

pub async fn published() -> Result<Vec<String>, String> {
    let mut cache = CACHE.lock().await;
    if let Some((at, endpoints)) = cache.as_ref() {
        if at.elapsed() < Duration::from_secs(60) {
            return Ok(endpoints.clone());
        }
    }
    let status = crate::auth::get_site_status().await?;
    let endpoints = parse(status.extra.get("api_endpoints").unwrap_or(&Value::Null));
    if endpoints.is_empty() {
        return Err("网站尚未配置有效的 API 接入地址，请稍后重试".into());
    }
    *cache = Some((Instant::now(), endpoints.clone()));
    Ok(endpoints)
}

pub async fn require(url: &str) -> Result<(), String> {
    let normalized = normalize(url).ok_or("请选择有效的 API 节点，网站首页不能用于模型调用")?;
    if published()
        .await?
        .iter()
        .any(|item| matches(item, &normalized))
    {
        Ok(())
    } else {
        Err("该地址不在网站发布的 API 节点中，请重新选择节点并保存配置".into())
    }
}

pub async fn resolve(preferred: &str) -> Result<String, String> {
    let endpoints = published().await?;
    Ok(endpoints
        .iter()
        .find(|item| normalize(preferred).is_some_and(|url| matches(item, &url)))
        .unwrap_or(&endpoints[0])
        .clone())
}

pub async fn validate_workspace(agent: &str) -> Result<(), String> {
    let (url, key) = match agent {
        "codex" => {
            let config = crate::codex::get_codex_config().map_err(|e| e.to_string())?;
            (config.base_url, config.api_key)
        }
        "claude" => {
            let config = crate::claude::get_claude_config().map_err(|e| e.to_string())?;
            (config.base_url, config.api_key)
        }
        "workbuddy" => {
            let config = crate::workbuddy::get_workbuddy_config().map_err(|e| e.to_string())?;
            (config.base_url, config.api_key)
        }
        "acciowork" => {
            let config = crate::accio::config::load_accio_config();
            (config.base_url, config.api_key)
        }
        _ => return Ok(()),
    };
    if key.trim().is_empty() {
        return Ok(());
    }
    require(&url).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_published_formats_without_homepage_or_credentials() {
        let raw = json!(["https://www.uocode.com/", "https://user:password@api.example.test", "bad", {"url":"https://api.example.test/"}, "https://api.example.test", "https://backup.example.test/v1"]);
        assert_eq!(
            parse(&raw),
            vec!["https://api.example.test", "https://backup.example.test/v1"]
        );
        assert_eq!(parse(&Value::String(raw.to_string())), parse(&raw));
        assert!(parse(&json!({})).is_empty());
        assert!(parse(&json!("invalid")).is_empty());
    }

    #[test]
    fn only_protocol_suffix_is_equivalent() {
        assert!(matches(
            "https://api.example.test/",
            "https://api.example.test/v1/"
        ));
        assert!(!matches(
            "https://api.example.test",
            "https://api.example.test/other"
        ));
        assert!(!matches(
            "https://api.example.test",
            "https://api.example.test.evil.test"
        ));
        assert!(normalize("https://www.uocode.com/v1").is_none());
        assert!(normalize("https://api.example.test?key=secret").is_none());
    }
}
