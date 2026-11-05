use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static CONFIG_IO: Mutex<()> = Mutex::new(());

fn default_vendor() -> String {
    "Custom".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyModelEntry {
    pub id: String,
    pub name: String,
    #[serde(default = "default_vendor")]
    pub vendor: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default = "default_true")]
    pub supports_tool_call: bool,
    #[serde(default = "default_true")]
    pub supports_images: bool,
    #[serde(default = "default_true")]
    pub supports_reasoning: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub only_reasoning: Option<bool>,
    #[serde(default)]
    pub use_custom_protocol: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<WorkbuddyReasoning>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyReasoning {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supported_efforts: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_disable_thinking: Option<bool>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkbuddyUIConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub config_exists: bool,
    pub config_path: String,
    pub is_installed: bool,
    pub app_path: Option<String>,

    // 高级功能开关
    pub supports_tool_call: bool,
    pub supports_images: bool,
    pub supports_reasoning: bool,
    pub only_reasoning: bool,
    pub can_disable_thinking: bool,
    pub use_custom_protocol: bool,

    // 思考强度设置
    pub default_effort: String,
    pub supported_efforts: Vec<String>,

    // Token 上限限制
    pub max_input_tokens: Option<u32>,
    pub max_output_tokens: Option<u32>,

    // 已配置的所有模型列表（支持多模型拼接）
    pub configured_models: Vec<WorkbuddyModelEntry>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkbuddySavePayload {
    pub url: String,
    pub api_key: String,
    pub model: String,

    pub supports_tool_call: bool,
    pub supports_images: bool,
    pub supports_reasoning: bool,
    pub only_reasoning: bool,
    pub can_disable_thinking: bool,
    pub use_custom_protocol: bool,

    pub default_effort: Option<String>,
    pub supported_efforts: Vec<String>,

    pub max_input_tokens: Option<u32>,
    pub max_output_tokens: Option<u32>,
}

pub fn workbuddy_config_path() -> Result<PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::ConfigNotFound("无法获取用户主目录".to_string()))?;
    let override_dir = ["WORKBUDDY_CONFIG_DIR", "CODEBUDDY_CONFIG_DIR"]
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|value| !value.trim().is_empty());
    let directory = override_dir
        .as_deref()
        .map(|value| PathBuf::from(value.trim()))
        .unwrap_or_else(|| home.join(".workbuddy"));
    let path = directory.join("models.json");
    if override_dir.is_none() {
        migrate_legacy_models(&home.join(".workbuddy-ai").join("models.json"), &path)?;
    }
    Ok(path)
}

fn model_document(path: &Path) -> Result<serde_json::Value, AppError> {
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let content = std::fs::read_to_string(path)?;
    let document: serde_json::Value = serde_json::from_str(content.trim_start_matches('\u{feff}'))?;
    // Refuse unknown formats instead of silently replacing an unreadable configuration.
    document_models(&document)?;
    Ok(document)
}

fn document_models(document: &serde_json::Value) -> Result<Vec<WorkbuddyModelEntry>, AppError> {
    let models = if document.is_array() {
        document
    } else {
        document
            .get("models")
            .ok_or_else(|| AppError::Other("WorkBuddy 配置格式无法识别，已保留原文件".into()))?
    };
    Ok(serde_json::from_value(models.clone())?)
}

fn encoded_model_document(
    mut document: serde_json::Value,
    models: &[WorkbuddyModelEntry],
) -> Result<Vec<u8>, AppError> {
    let removed: std::collections::HashSet<String> = document_models(&document)?
        .into_iter()
        .filter(|old| !models.iter().any(|model| model.id == old.id))
        .map(|old| old.id)
        .collect();
    let entries = serde_json::to_value(models)?;
    if document.is_array() {
        document = entries;
    } else {
        document["models"] = entries;
        if let Some(available) = document
            .get_mut("availableModels")
            .and_then(|v| v.as_array_mut())
        {
            // Remove only deleted custom IDs, preserving official and unknown IDs.
            available.retain(|id| !id.as_str().is_some_and(|id| removed.contains(id)));
            for model in models {
                if !available.iter().any(|id| id.as_str() == Some(&model.id)) {
                    available.push(serde_json::Value::String(model.id.clone()));
                }
            }
        }
    }
    Ok(serde_json::to_vec_pretty(&document)?)
}

fn replace_model_file(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    use std::io::Write;
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Other("Invalid model configuration path".into()))?;
    std::fs::create_dir_all(parent)?;
    let mut staged = tempfile::NamedTempFile::new_in(parent)?;
    staged.write_all(bytes)?;
    staged.as_file().sync_all()?;
    staged.persist(path).map_err(|error| {
        AppError::Other(format!(
            "Cannot replace {}: {}",
            path.display(),
            error.error
        ))
    })?;
    Ok(())
}

fn write_model_document(
    path: &Path,
    document: serde_json::Value,
    models: &[WorkbuddyModelEntry],
) -> Result<(), AppError> {
    replace_model_file(path, &encoded_model_document(document, models)?)
}

fn model_sync_paths(
    home: &Path,
    workbuddy_dir: Option<&str>,
    codebuddy_dir: Option<&str>,
) -> Vec<PathBuf> {
    // Explicit directories represent independent client profiles. Respect the same priority
    // as WorkBuddy rather than mixing two users' configurations into every candidate.
    if let Some(directory) = [workbuddy_dir, codebuddy_dir]
        .into_iter()
        .flatten()
        .find(|value| !value.trim().is_empty())
    {
        return vec![PathBuf::from(directory.trim()).join("models.json")];
    }
    let mut paths = vec![home.join(".workbuddy/models.json")];
    let legacy = home.join(".workbuddy-ai/models.json");
    if legacy.exists() {
        paths.push(legacy);
    }
    paths
}

fn sync_model_change(
    paths: &[PathBuf],
    model_id: &str,
    replacement: Option<&WorkbuddyModelEntry>,
) -> Result<(), AppError> {
    use std::io::Write;
    // Validate and serialize every destination before changing any file.
    let mut changes = Vec::new();
    for path in paths {
        let document = model_document(path)?;
        let mut models = document_models(&document)?;
        if replacement.is_none() && !models.iter().any(|entry| entry.id == model_id) {
            continue;
        }
        if let Some(model) = replacement {
            if let Some(existing) = models.iter_mut().find(|entry| entry.id == model_id) {
                let mut updated = model.clone();
                for (key, value) in &existing.extra {
                    updated
                        .extra
                        .entry(key.clone())
                        .or_insert_with(|| value.clone());
                }
                *existing = updated;
            } else {
                models.push(model.clone());
            }
        } else {
            models.retain(|entry| entry.id != model_id);
        }
        let original = if path.exists() {
            Some(std::fs::read(path)?)
        } else {
            None
        };
        changes.push((path, original, encoded_model_document(document, &models)?));
    }
    // Keep the first pre-sync copy as a recovery artifact, without replacing an older backup.
    for (path, original, _) in &changes {
        if let Some(bytes) = original {
            let backup = path.with_file_name("models.json.ai-helper-before-sync.bak");
            match std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(backup)
            {
                Ok(mut file) => {
                    file.write_all(bytes)?;
                    file.sync_all()?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        }
    }
    for (index, (path, _, bytes)) in changes.iter().enumerate() {
        if let Err(error) = replace_model_file(path, bytes) {
            let mut rollback_errors = Vec::new();
            for (written, original, _) in changes[..index].iter().rev() {
                let result = match original {
                    Some(bytes) => replace_model_file(written, bytes),
                    None => std::fs::remove_file(written).map_err(AppError::from),
                };
                if let Err(error) = result {
                    rollback_errors.push(error.to_string());
                }
            }
            return if rollback_errors.is_empty() {
                Err(error)
            } else {
                Err(AppError::Other(format!(
                    "{error}; rollback failed: {}",
                    rollback_errors.join("; ")
                )))
            };
        }
    }
    Ok(())
}

fn current_sync_paths() -> Result<Vec<PathBuf>, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::ConfigNotFound("Home directory unavailable".into()))?;
    Ok(model_sync_paths(
        &home,
        std::env::var("WORKBUDDY_CONFIG_DIR").ok().as_deref(),
        std::env::var("CODEBUDDY_CONFIG_DIR").ok().as_deref(),
    ))
}

fn migrate_legacy_models(legacy: &Path, active: &Path) -> Result<(), AppError> {
    use std::io::Write;
    let marker = active.with_file_name(".ai-helper-models-migration-v1");
    if !legacy.exists() || marker.exists() {
        return Ok(());
    }
    let legacy_document = model_document(legacy)?;
    let legacy_models = document_models(&legacy_document)?;
    if legacy_models.is_empty() {
        return Ok(());
    }
    let active_document = model_document(active)?;
    let mut models = document_models(&active_document)?;
    let original_count = models.len();
    for model in legacy_models {
        // A model edited in WorkBuddy takes precedence over a stale helper copy.
        if !models.iter().any(|existing| existing.id == model.id) {
            models.push(model);
        }
    }
    if models.len() != original_count {
        if active.exists() {
            let backup = active.with_file_name("models.json.ai-helper-before-migration.bak");
            match std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(backup)
            {
                Ok(mut file) => file.write_all(&std::fs::read(active)?)?,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        }
        write_model_document(active, active_document, &models)?;
    }
    if let Some(parent) = marker.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        marker,
        "Legacy models imported; original legacy file preserved.\n",
    )?;
    Ok(())
}

pub fn detect_workbuddy_installation() -> (bool, Option<String>) {
    // 0. 优先检查用户已保存的自定义安装路径
    let saved = crate::app_paths::load_app_paths();
    if let Some(ref custom) = saved.workbuddy_client_path {
        let p = PathBuf::from(custom);
        if p.exists() {
            return (true, Some(custom.clone()));
        }
    }

    // 1. 调用系统化深度探测模式 (进程、Store应用包、注册表、标准目录与多盘符)
    let detected = crate::app_paths::detect_workbuddy_client_path();
    if detected.exists && !detected.path.is_empty() {
        return (true, Some(detected.path));
    }

    (false, None)
}

/// 解析 WorkBuddy 本地 models.json 配置文件内容，支持标准数组格式与包装对象格式
#[cfg(test)]
pub fn parse_workbuddy_entries_from_str(content: &str) -> Vec<WorkbuddyModelEntry> {
    let trimmed = content.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    // 优先尝试标准数组格式: [ { ... }, { ... } ]
    if let Ok(arr) = serde_json::from_str::<Vec<WorkbuddyModelEntry>>(trimmed) {
        return arr;
    }

    // 兼容可能存在的对象格式: { "models": [ ... ] }
    if let Ok(obj) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(models_val) = obj.get("models") {
            if let Ok(arr) = serde_json::from_value::<Vec<WorkbuddyModelEntry>>(models_val.clone())
            {
                return arr;
            }
        }
    }

    Vec::new()
}

pub fn get_workbuddy_config() -> Result<WorkbuddyUIConfig, AppError> {
    let _guard = CONFIG_IO.lock().unwrap();
    let path = workbuddy_config_path()?;
    let config_exists = path.exists();
    let (is_installed, app_path) = detect_workbuddy_installation();

    let mut base_url = String::new();
    let mut api_key = String::new();
    let mut model = "gpt-5.6-sol".to_string();

    let mut supports_tool_call = true;
    let mut supports_images = true;
    let mut supports_reasoning = true;
    let mut only_reasoning = false;
    let mut can_disable_thinking = true;
    let mut use_custom_protocol = false;
    let mut default_effort = String::new();
    let mut supported_efforts = vec!["medium".to_string()];
    let mut max_input_tokens = Some(32768);
    let mut max_output_tokens = Some(32768);

    let entries = document_models(&model_document(&path)?)?;

    if let Some(entry) = entries
        .iter()
        .find(|e| e.vendor == "Custom")
        .or_else(|| entries.first())
    {
        model = entry.id.clone();
        if let Some(k) = &entry.api_key {
            api_key = k.clone();
        }

        // 规范化 URL 映射回预设节点
        let raw_url = entry.url.trim_end_matches('/');
        let stripped = raw_url.strip_suffix("/v1").unwrap_or(raw_url);
        if !stripped.is_empty() {
            base_url = format!("{}/", stripped);
        }

        supports_tool_call = entry.supports_tool_call;
        supports_images = entry.supports_images;
        supports_reasoning = entry.supports_reasoning;
        only_reasoning = entry.only_reasoning.unwrap_or(false);
        use_custom_protocol = entry.use_custom_protocol;

        if let Some(reasoning) = &entry.reasoning {
            if let Some(efforts) = &reasoning.supported_efforts {
                supported_efforts = efforts.clone();
            }
            if let Some(de) = &reasoning.default_effort {
                default_effort = de.clone();
            }
            if let Some(cdt) = reasoning.can_disable_thinking {
                can_disable_thinking = cdt;
            }
        }

        max_input_tokens = entry.max_input_tokens;
        max_output_tokens = entry.max_output_tokens;
    }

    Ok(WorkbuddyUIConfig {
        base_url,
        api_key,
        model,
        config_exists,
        config_path: path.display().to_string(),
        is_installed: is_installed || config_exists,
        app_path,
        supports_tool_call,
        supports_images,
        supports_reasoning,
        only_reasoning,
        can_disable_thinking,
        use_custom_protocol,
        default_effort,
        supported_efforts,
        max_input_tokens,
        max_output_tokens,
        configured_models: entries,
    })
}

pub fn set_workbuddy_config(payload: WorkbuddySavePayload) -> Result<(), AppError> {
    let _guard = CONFIG_IO.lock().unwrap();
    let path = workbuddy_config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // 规范化后端请求 URL
    // WorkBuddy 会补全协议路径，这里只保存发布的 API 节点和版本前缀。
    let normalized_url = if payload.use_custom_protocol {
        payload.url.trim().to_string()
    } else {
        let trimmed = payload.url.trim().trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            trimmed.to_string()
        } else {
            format!("{}/v1", trimmed)
        }
    };

    // 读取现有配置，保留已配置的其他模型
    let document = model_document(&path)?;
    let mut entries = document_models(&document)?;
    let model_id = payload.model.trim().to_string();

    let reasoning_config = if payload.supports_reasoning {
        Some(WorkbuddyReasoning {
            supported_efforts: if payload.supported_efforts.is_empty() {
                None
            } else {
                Some(payload.supported_efforts)
            },
            default_effort: if payload.default_effort.as_deref().unwrap_or("").is_empty() {
                None
            } else {
                payload.default_effort
            },
            can_disable_thinking: if payload.can_disable_thinking {
                None // WorkBuddy 默认为 true
            } else {
                Some(false)
            },
            extra: serde_json::Map::new(),
        })
    } else {
        None
    };

    let new_entry = WorkbuddyModelEntry {
        id: model_id.clone(),
        name: model_id.clone(),
        vendor: "Custom".to_string(),
        url: normalized_url,
        api: Some("openai-responses".to_string()),
        api_key: if payload.api_key.trim().is_empty() {
            None
        } else {
            Some(payload.api_key.trim().to_string())
        },
        supports_tool_call: payload.supports_tool_call,
        supports_images: payload.supports_images,
        supports_reasoning: payload.supports_reasoning,
        only_reasoning: if payload.only_reasoning {
            Some(true)
        } else {
            None
        },
        use_custom_protocol: payload.use_custom_protocol,
        reasoning: reasoning_config,
        max_input_tokens: payload.max_input_tokens,
        max_output_tokens: payload.max_output_tokens,
        temperature: None,
        disabled: None,
        extra: serde_json::Map::new(),
    };

    // 核心变更：仅当在已配置模型中存在完全相同 model_id 时更新该项；
    // 否则直接作为新模型追加（拼接）至模型数组末尾，绝不覆盖已有模型
    if let Some(idx) = entries.iter().position(|e| e.id == model_id) {
        let mut updated = new_entry;
        updated.extra = entries[idx].extra.clone();
        if entries[idx].api.is_some() {
            updated.api = entries[idx].api.clone();
        }
        entries[idx] = updated;
    } else {
        entries.push(new_entry);
    }

    let replacement = entries.iter().find(|entry| entry.id == model_id).unwrap();
    sync_model_change(&current_sync_paths()?, &model_id, Some(replacement))?;

    Ok(())
}

pub fn delete_workbuddy_model(model_id: String) -> Result<Vec<WorkbuddyModelEntry>, AppError> {
    let _guard = CONFIG_IO.lock().unwrap();
    let path = workbuddy_config_path()?;

    let document = model_document(&path)?;
    let mut entries = document_models(&document)?;
    entries.retain(|e| e.id != model_id.trim());
    sync_model_change(&current_sync_paths()?, model_id.trim(), None)?;

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_paths_respect_independent_environment_profiles() {
        let root = tempfile::tempdir().unwrap();
        let home = root.path();
        let active = home.join(".workbuddy/models.json");
        assert_eq!(model_sync_paths(home, None, None), vec![active.clone()]);
        let legacy = home.join(".workbuddy-ai/models.json");
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        std::fs::write(&legacy, "[]").unwrap();
        assert_eq!(model_sync_paths(home, None, None), vec![active, legacy]);
        let profile_a = home.join("profile-a").to_string_lossy().to_string();
        let profile_b = home.join("profile-b").to_string_lossy().to_string();
        assert_eq!(
            model_sync_paths(home, Some(&profile_a), Some(&profile_b)),
            vec![PathBuf::from(&profile_a).join("models.json")]
        );
        assert_eq!(
            model_sync_paths(home, Some("  "), Some(&profile_b)),
            vec![PathBuf::from(&profile_b).join("models.json")]
        );
    }

    #[test]
    fn synced_save_and_delete_preserve_wrappers_unrelated_models_and_first_backup() {
        let root = tempfile::tempdir().unwrap();
        let active = root.path().join(".workbuddy/models.json");
        let legacy = root.path().join(".workbuddy-ai/models.json");
        for path in [&active, &legacy] {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        }
        std::fs::write(
            &active,
            serde_json::json!({
                "models":[fixture_model("shared", "primary-key")],
                "availableModels":["official", "shared"], "customSetting":true
            })
            .to_string(),
        )
        .unwrap();
        let legacy_text = serde_json::json!({
            "models":[fixture_model("shared", "old-key"), fixture_model("legacy-only", "other-key")],
            "availableModels":["official", "shared", "legacy-only"], "legacySetting":42
        }).to_string();
        std::fs::write(&legacy, &legacy_text).unwrap();
        migrate_legacy_models(&legacy, &active).unwrap();
        let paths = model_sync_paths(root.path(), None, None);
        let mut replacement: WorkbuddyModelEntry =
            serde_json::from_value(fixture_model("shared", "new-key")).unwrap();
        replacement
            .extra
            .insert("clientSetting".into(), serde_json::json!(true));
        sync_model_change(&paths, "shared", Some(&replacement)).unwrap();
        for path in &paths {
            let document = model_document(path).unwrap();
            let entries = document_models(&document).unwrap();
            let shared = entries.iter().find(|model| model.id == "shared").unwrap();
            assert_eq!(shared.api_key.as_deref(), Some("new-key"));
            assert_eq!(shared.extra["clientSetting"], true);
            assert!(entries.iter().any(|model| model.id == "legacy-only"));
        }
        sync_model_change(&paths, "shared", None).unwrap();
        migrate_legacy_models(&legacy, &active).unwrap();
        for path in &paths {
            let document = model_document(path).unwrap();
            assert_eq!(
                document_models(&document)
                    .unwrap()
                    .iter()
                    .map(|model| model.id.as_str())
                    .collect::<Vec<_>>(),
                vec!["legacy-only"]
            );
            assert_eq!(
                document["availableModels"],
                serde_json::json!(["official", "legacy-only"])
            );
        }
        assert_eq!(model_document(&active).unwrap()["customSetting"], true);
        assert_eq!(model_document(&legacy).unwrap()["legacySetting"], 42);
        assert_eq!(
            std::fs::read_to_string(legacy.with_file_name("models.json.ai-helper-before-sync.bak"))
                .unwrap(),
            legacy_text
        );
    }

    #[test]
    fn corrupt_mirror_aborts_sync_before_any_original_is_changed() {
        let root = tempfile::tempdir().unwrap();
        let active = root.path().join("models.json");
        let legacy = root.path().join("legacy.json");
        let original = serde_json::json!([fixture_model("shared", "old-key")]).to_string();
        std::fs::write(&active, &original).unwrap();
        std::fs::write(&legacy, "{broken").unwrap();
        assert!(sync_model_change(&[active.clone(), legacy.clone()], "shared", None).is_err());
        assert_eq!(std::fs::read_to_string(active).unwrap(), original);
        assert_eq!(std::fs::read_to_string(legacy).unwrap(), "{broken");
    }

    #[cfg(windows)]
    #[test]
    fn failed_mirror_replace_rolls_back_already_written_primary() {
        let root = tempfile::tempdir().unwrap();
        let active = root.path().join("models.json");
        let legacy = root.path().join("legacy.json");
        let original = serde_json::json!([fixture_model("shared", "old-key")]).to_string();
        std::fs::write(&active, &original).unwrap();
        std::fs::write(&legacy, &original).unwrap();
        let writable = std::fs::metadata(&legacy).unwrap().permissions();
        let mut readonly = writable.clone();
        readonly.set_readonly(true);
        std::fs::set_permissions(&legacy, readonly).unwrap();
        let result = sync_model_change(&[active.clone(), legacy.clone()], "shared", None);
        std::fs::set_permissions(&legacy, writable).unwrap();
        assert!(result.is_err());
        assert_eq!(std::fs::read_to_string(active).unwrap(), original);
        assert_eq!(std::fs::read_to_string(legacy).unwrap(), original);
    }

    fn fixture_model(id: &str, key: &str) -> serde_json::Value {
        serde_json::json!({"id":id,"name":id,"url":"https://node.example/v1","apiKey":key})
    }

    #[test]
    fn migration_merges_missing_models_preserving_active_models_and_wrapper() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("legacy.json");
        let active = root.path().join("models.json");
        let legacy_text = serde_json::json!([
            fixture_model("existing", "stale-key"),
            fixture_model("imported", "fixture-key")
        ])
        .to_string();
        let active_text = serde_json::json!({
            "models":[fixture_model("existing", "current-key")],
            "availableModels":["official", "existing"], "unknownSetting":{"preserve":true}
        })
        .to_string();
        std::fs::write(&legacy, &legacy_text).unwrap();
        std::fs::write(&active, &active_text).unwrap();
        migrate_legacy_models(&legacy, &active).unwrap();
        let document = model_document(&active).unwrap();
        let entries = document_models(&document).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].api_key.as_deref(), Some("current-key"));
        assert_eq!(entries[1].id, "imported");
        assert_eq!(document["unknownSetting"]["preserve"], true);
        assert_eq!(
            document["availableModels"],
            serde_json::json!(["official", "existing", "imported"])
        );
        assert_eq!(std::fs::read_to_string(&legacy).unwrap(), legacy_text);
        assert_eq!(
            std::fs::read_to_string(
                root.path()
                    .join("models.json.ai-helper-before-migration.bak")
            )
            .unwrap(),
            active_text
        );
        write_model_document(&active, document, &entries[..1]).unwrap();
        migrate_legacy_models(&legacy, &active).unwrap();
        assert_eq!(
            document_models(&model_document(&active).unwrap())
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn migration_creates_actual_directory_and_imports_bom_json() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("legacy.json");
        let active = root.path().join(".workbuddy/models.json");
        std::fs::write(
            &legacy,
            format!(
                "\u{feff}{}",
                serde_json::json!([fixture_model("my-model", "fixture-key")])
            ),
        )
        .unwrap();
        migrate_legacy_models(&legacy, &active).unwrap();
        assert_eq!(
            document_models(&model_document(&active).unwrap()).unwrap()[0].id,
            "my-model"
        );
    }

    #[test]
    fn migration_rejects_malformed_or_unknown_active_format_without_overwriting() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("legacy.json");
        let active = root.path().join("models.json");
        std::fs::write(
            &legacy,
            serde_json::json!([fixture_model("my-model", "fixture-key")]).to_string(),
        )
        .unwrap();
        for text in ["{invalid", r#"{"encryptedPayload":"preserve-me"}"#] {
            std::fs::write(&active, text).unwrap();
            assert!(migrate_legacy_models(&legacy, &active).is_err());
            assert_eq!(std::fs::read_to_string(&active).unwrap(), text);
            assert!(!active
                .with_file_name(".ai-helper-models-migration-v1")
                .exists());
        }
    }

    #[test]
    #[ignore = "Explicitly migrates the installed client's legacy model configuration"]
    fn migrate_installed_workbuddy_configuration() {
        let path = workbuddy_config_path().unwrap();
        let models = document_models(&model_document(&path).unwrap()).unwrap();
        println!("Active model configuration: {}", path.display());
        println!(
            "Model IDs: {:?}",
            models.iter().map(|model| &model.id).collect::<Vec<_>>()
        );
        assert!(!models.is_empty());
    }

    #[test]
    fn test_parse_multi_model_json_with_and_without_api() {
        let sample = r#"[
  {
    "id": "gpt-5.6-sol",
    "name": "gpt-5.6-sol",
    "vendor": "Custom",
    "url": "https://www.uocode.com/v1",
    "api": "openai-responses",
    "apiKey": "sk-test1",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "reasoning": {
      "supportedEfforts": [
        "medium"
      ]
    },
    "maxInputTokens": 32768,
    "maxOutputTokens": 32768
  },
  {
    "id": "gpt-6-sol",
    "name": "gpt-6-sol",
    "vendor": "Custom",
    "url": "https://www.uocode.com/v1",
    "apiKey": "sk-test2",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "reasoning": {
      "supportedEfforts": [
        "medium"
      ]
    },
    "maxInputTokens": 32768,
    "maxOutputTokens": 32768
  }
]"#;

        let entries = parse_workbuddy_entries_from_str(sample);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, "gpt-5.6-sol");
        assert_eq!(entries[0].api, Some("openai-responses".to_string()));
        assert_eq!(entries[1].id, "gpt-6-sol");
        assert_eq!(entries[1].api, None);
    }

    #[test]
    fn test_append_new_model_does_not_overwrite_existing() {
        let sample = r#"[
  {
    "id": "gpt-5.6-sol",
    "name": "gpt-5.6-sol",
    "vendor": "Custom",
    "url": "https://www.uocode.com/v1",
    "api": "openai-responses",
    "apiKey": "sk-test1",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false
  }
]"#;

        let mut entries = parse_workbuddy_entries_from_str(sample);
        assert_eq!(entries.len(), 1);

        let new_model_id = "gpt-6-sol".to_string();
        let new_entry = WorkbuddyModelEntry {
            id: new_model_id.clone(),
            name: new_model_id.clone(),
            vendor: "Custom".to_string(),
            url: "https://www.uocode.com/v1".to_string(),
            api: Some("openai-responses".to_string()),
            api_key: Some("sk-test2".to_string()),
            supports_tool_call: true,
            supports_images: true,
            supports_reasoning: true,
            only_reasoning: None,
            use_custom_protocol: false,
            reasoning: None,
            max_input_tokens: Some(32768),
            max_output_tokens: Some(32768),
            temperature: None,
            disabled: None,
            extra: serde_json::Map::new(),
        };

        // 仅匹配同 ID
        if let Some(idx) = entries.iter().position(|e| e.id == new_model_id) {
            entries[idx] = new_entry;
        } else {
            entries.push(new_entry);
        }

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, "gpt-5.6-sol");
        assert_eq!(entries[1].id, "gpt-6-sol");
    }

    #[test]
    fn test_update_model_with_same_id() {
        let sample = r#"[
  {
    "id": "gpt-5.6-sol",
    "name": "gpt-5.6-sol",
    "vendor": "Custom",
    "url": "https://www.uocode.com/v1",
    "apiKey": "sk-old",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false
  }
]"#;

        let mut entries = parse_workbuddy_entries_from_str(sample);
        assert_eq!(entries.len(), 1);

        let update_id = "gpt-5.6-sol".to_string();
        let updated_entry = WorkbuddyModelEntry {
            id: update_id.clone(),
            name: update_id.clone(),
            vendor: "Custom".to_string(),
            url: "https://www.uocode.com/v1".to_string(),
            api: Some("openai-responses".to_string()),
            api_key: Some("sk-new".to_string()),
            supports_tool_call: true,
            supports_images: true,
            supports_reasoning: true,
            only_reasoning: None,
            use_custom_protocol: false,
            reasoning: None,
            max_input_tokens: Some(65536),
            max_output_tokens: Some(65536),
            temperature: None,
            disabled: None,
            extra: serde_json::Map::new(),
        };

        if let Some(idx) = entries.iter().position(|e| e.id == update_id) {
            entries[idx] = updated_entry;
        } else {
            entries.push(updated_entry);
        }

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "gpt-5.6-sol");
        assert_eq!(entries[0].api_key, Some("sk-new".to_string()));
        assert_eq!(entries[0].max_input_tokens, Some(65536));
    }
}
