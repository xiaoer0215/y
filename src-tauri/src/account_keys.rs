use crate::auth::{account_request, read_account_data};
use serde::Deserialize;
use serde_json::{json, Value};

fn key_response_data(response: Value, action: &str) -> Result<Value, String> {
    response
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or_else(|| format!("{action}响应缺少 data 对象"))
}

async fn read_key_data(
    path: &str,
    query: &[(String, String)],
    action: &str,
) -> Result<Value, String> {
    // The shared reader preserves the envelope for pricing metadata.
    // Key endpoints expose their payload inside data.
    key_response_data(read_account_data(path, query, action).await?, action)
}

#[tauri::command]
pub async fn get_site_notice() -> Result<String, String> {
    let value = account_request(reqwest::Method::GET, "/api/notice", None, None, false).await?;
    value
        .as_str()
        .map(str::to_owned)
        .ok_or("公告响应格式异常".into())
}

#[tauri::command]
pub async fn list_account_keys(page: u32, keyword: String) -> Result<Value, String> {
    if page == 0 || keyword.len() > 256 {
        return Err("密钥查询参数无效".into());
    }
    read_key_data(
        if keyword.trim().is_empty() {
            "/api/token/"
        } else {
            "/api/token/search"
        },
        &[
            ("p".into(), page.to_string()),
            ("size".into(), "10".into()),
            ("keyword".into(), keyword.trim().into()),
        ],
        "获取密钥列表",
    )
    .await
}

fn valid_id(id: i64) -> Result<(), String> {
    if id <= 0 {
        Err("密钥编号无效".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub async fn get_account_key(id: i64) -> Result<Value, String> {
    valid_id(id)?;
    read_key_data(&format!("/api/token/{id}"), &[], "获取密钥详情").await
}

#[tauri::command]
pub async fn get_key_groups() -> Result<Value, String> {
    let (groups, auto) = tokio::try_join!(
        read_key_data("/api/user/self/groups", &[], "获取可选分组"),
        read_key_data("/api/token/auto-groups", &[], "获取自动分组")
    )?;
    Ok(json!({"groups":groups,"auto":auto}))
}

#[derive(Deserialize)]
pub struct KeyForm {
    name: String,
    remain_quota: i64,
    unlimited_quota: bool,
    expired_time: i64,
    group: String,
    auto_groups: Vec<String>,
    cross_group_retry: bool,
    model_limits_enabled: bool,
    model_limits: String,
    allow_ips: String,
}

#[tauri::command]
pub async fn save_account_key(id: Option<i64>, form: KeyForm) -> Result<(), String> {
    if form.name.trim().is_empty()
        || form.name.trim().len() > 50
        || form.remain_quota < 0
        || form.remain_quota > 500_000_000_000_000
        || (form.expired_time != -1 && form.expired_time <= 0)
        || form.group.len() > 128
        || form.auto_groups.len() > 100
        || form.model_limits.len() > 32000
        || form.allow_ips.len() > 32000
    {
        return Err("请检查名称、额度、有效期和限制参数".into());
    }
    let mut body = json!({"name":form.name.trim(),"remain_quota":form.remain_quota,"unlimited_quota":form.unlimited_quota,"expired_time":form.expired_time,"group":form.group,"auto_groups":form.auto_groups,"cross_group_retry":form.cross_group_retry,"model_limits_enabled":form.model_limits_enabled,"model_limits":form.model_limits,"allow_ips":form.allow_ips});
    if let Some(id) = id {
        valid_id(id)?;
        body["id"] = json!(id);
    }
    account_request(
        if id.is_some() {
            reqwest::Method::PUT
        } else {
            reqwest::Method::POST
        },
        "/api/token/",
        Some(&body),
        None,
        true,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn set_account_key_status(id: i64, status: u8) -> Result<(), String> {
    valid_id(id)?;
    if status != 1 && status != 2 {
        return Err("密钥状态无效".into());
    }
    account_request(
        reqwest::Method::PUT,
        "/api/token/?status_only=true",
        Some(&json!({"id":id,"status":status})),
        None,
        true,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_account_key(id: i64) -> Result<(), String> {
    valid_id(id)?;
    account_request(
        reqwest::Method::DELETE,
        &format!("/api/token/{id}/"),
        None,
        None,
        true,
    )
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_response_unwraps_list_detail_and_group_payloads() {
        for data in [
            json!({"items":[{"id":7}],"total":21,"page":2,"page_size":10}),
            json!({"items":[],"total":0,"page":1,"page_size":10}),
            json!({"id":7,"name":"fixture","auto_groups":["vip"],"model_limits":"fixture-model","allow_ips":"127.0.0.1"}),
            json!({"default":{"ratio":1},"vip":{"ratio":2}}),
            json!({"groups":["vip","default"],"max_count":2}),
            json!({}),
        ] {
            let response = json!({"success":true,"message":"","data":data});
            assert_eq!(key_response_data(response, "读取密钥").unwrap(), data);
        }
    }

    #[test]
    fn key_response_rejects_missing_or_invalid_payload() {
        for response in [
            json!({"success":true}),
            json!({"success":true,"data":null}),
            json!({"success":true,"data":[]}),
            json!({"success":true,"data":"invalid"}),
        ] {
            assert!(key_response_data(response, "读取密钥").is_err());
        }
    }
}
